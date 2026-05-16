package com.samhanair.logis.notification.service;

import com.opencsv.CSVReaderHeaderAware;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import com.samhanair.logis.notification.dto.ChatRoomImportResult;
import com.samhanair.logis.notification.dto.ChatRoomImportResult.RejectedRow;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.apache.commons.io.input.BOMInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Notion CSV import 서비스 (PR-D Part 2-3, TM Part 3 매핑 정정).
 *
 * <p>Notion DB "단톡방리스트" export CSV 를 partner_chat_room_mappings 테이블로 적재.
 * 컬럼 헤더는 순서 무관 (header-aware) 이며, 다음 두 형식을 동시 지원:
 * <ul>
 *   <li>기본 (Notion export 원본) — {@code "이카운트 사업자명"}, {@code "카톡방"}, {@code "생성 일시"}</li>
 *   <li>코드 우선 (운영자 보강) — 위 컬럼 + {@code "거래처코드"} (또는 {@code "partner_code"})</li>
 * </ul>
 *
 * <p>매핑 우선순위 (TM PR-D Part 3 — 사용자 명시 "거래처명이 아니라 거래처코드로 매핑"):
 * <ol>
 *   <li>{@code 거래처코드} 컬럼 값이 있으면 {@link PartnerLookupClient#verifyPartnerCode(String)}
 *       로 존재 검증 후 즉시 사용 — 사업자명 lookup 회피 (모호한 LIKE 매칭 제거).</li>
 *   <li>코드가 비어 있거나 검증 실패 시 {@code 이카운트 사업자명} 으로
 *       {@link PartnerLookupClient#findPartnerCodeByName(String)} fallback.</li>
 *   <li>둘 다 실패하더라도 legacy Notion 원본처럼 사업자명만 있는 행은 alias partnerCode 로 보존한다.</li>
 * </ol>
 *
 * <p>처리 절차:
 * <ol>
 *   <li>UTF-8 BOM 제거 ({@link BOMInputStream})</li>
 *   <li>{@link CSVReaderHeaderAware} 로 row 단위 Map 추출</li>
 *   <li>코드 우선 → 사업자명 fallback 매핑 (위 정책)</li>
 *   <li>match 시 활성 (partner_code, chat_room_name) 중복 체크 → insert 또는 snapshot 갱신</li>
 *   <li>{@code 생성 일시} 한국어 포맷 ("2026년 4월 26일 오전 7:34") 파싱 → {@link LocalDateTime}</li>
 * </ol>
 *
 * <p>본 서비스는 한 row 의 lookup 실패가 다른 row 처리를 방해하지 않도록 row 단위 try/catch.
 * 전체 트랜잭션 = 1 — 단, reject 가 있어도 정상 row 는 commit (운영자가 reject 보고서 보고 수기 처리).
 */
@Service
@RequiredArgsConstructor
public class ChatRoomImportService {

    private static final Logger log = LoggerFactory.getLogger(ChatRoomImportService.class);

    private static final String COL_BUSINESS_NAME = "이카운트 사업자명";
    private static final String COL_CHAT_ROOM = "카톡방";
    private static final String COL_NOTION_CREATED_AT = "생성 일시";
    /** TM PR-D Part 3 — 거래처코드 우선 매핑 컬럼 (한국어 헤더). */
    private static final String COL_PARTNER_CODE = "거래처코드";
    /** TM PR-D Part 3 — 거래처코드 우선 매핑 컬럼 (영문 헤더 대안). */
    private static final String COL_PARTNER_CODE_EN = "partner_code";
    private static final String LEGACY_ALIAS_PREFIX = "LEGACY-NAME-";

    /**
     * Notion 한국어 datetime 포맷터 — "2026년 4월 26일 오전 7:34".
     *
     * <p>패턴 = {@code yyyy년 M월 d일 a h:mm} (Locale.KOREAN). M/d 는 1자리 허용, h 는 12-hour, a 는 오전/오후.
     * 분이 1자리인 경우 ("오전 7:4") 도 fallback 으로 처리.
     */
    private static final DateTimeFormatter NOTION_DATETIME = new DateTimeFormatterBuilder()
            .appendPattern("yyyy년 M월 d일 a h:mm")
            .toFormatter(Locale.KOREAN);

    private final PartnerChatRoomMappingRepository repository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * CSV InputStream 을 import.
     *
     * @param csvStream Notion export CSV (UTF-8, BOM 허용)
     * @return inserted / updated / rejected 종합 결과
     * @throws IOException CSV 읽기 실패 (전체 import 실패)
     */
    @Transactional
    public ChatRoomImportResult importCsv(InputStream csvStream) throws IOException {
        int inserted = 0;
        int updated = 0;
        List<RejectedRow> rejected = new ArrayList<>();

        try (InputStream bomFree = BOMInputStream.builder().setInputStream(csvStream).get();
             Reader reader = new BufferedReader(new InputStreamReader(bomFree, StandardCharsets.UTF_8));
             CSVReaderHeaderAware csv = new CSVReaderHeaderAware(reader)) {

            int rowNumber = 0;
            Map<String, String> values;
            while ((values = csv.readMap()) != null) {
                rowNumber++;
                String businessName = trimToNull(values.get(COL_BUSINESS_NAME));
                String chatRoomName = trimToNull(values.get(COL_CHAT_ROOM));
                String createdAtRaw = trimToNull(values.get(COL_NOTION_CREATED_AT));
                // TM PR-D Part 3 — 거래처코드 컬럼 우선 (한국어 / 영문 헤더 모두 허용).
                String inputPartnerCode = trimToNull(values.get(COL_PARTNER_CODE));
                if (inputPartnerCode == null) {
                    inputPartnerCode = trimToNull(values.get(COL_PARTNER_CODE_EN));
                }

                if (chatRoomName == null) {
                    rejected.add(new RejectedRow(rowNumber, businessName, chatRoomName,
                            "필수 컬럼 누락 (카톡방)"));
                    continue;
                }
                if (inputPartnerCode == null && businessName == null) {
                    rejected.add(new RejectedRow(rowNumber, businessName, chatRoomName,
                            "필수 컬럼 누락 (이카운트 사업자명 / 카톡방)"));
                    continue;
                }

                Optional<String> partnerCodeOpt;
                String lookupVia;
                try {
                    if (inputPartnerCode != null) {
                        // TM PR-D Part 3 — 코드 우선 검증 (정확 매칭, LIKE 모호성 제거).
                        partnerCodeOpt = partnerLookupClient.verifyPartnerCode(inputPartnerCode);
                        lookupVia = "거래처코드";
                        if (partnerCodeOpt.isEmpty() && businessName != null) {
                            // 코드 검증 실패 시 사업자명 fallback (코드 오타 / 미등록 대비).
                            partnerCodeOpt = partnerLookupClient.findPartnerCodeByName(businessName);
                            lookupVia = "거래처코드 미매칭 → 사업자명 fallback";
                        }
                    } else {
                        partnerCodeOpt = partnerLookupClient.findPartnerCodeByName(businessName);
                        lookupVia = "사업자명";
                    }
                } catch (Exception e) {
                    log.warn("partner-service lookup 실패 row={} code={} name={} : {}",
                            rowNumber, inputPartnerCode, businessName, e.getMessage());
                    rejected.add(new RejectedRow(rowNumber, businessName, chatRoomName,
                            "partner-service lookup 호출 실패: " + e.getMessage()));
                    continue;
                }

                if (partnerCodeOpt.isEmpty() && businessName == null) {
                    rejected.add(new RejectedRow(rowNumber, businessName, chatRoomName,
                            "partner_code lookup miss (사업자명 없이 alias 생성 불가)"));
                    continue;
                }
                String partnerCode = partnerCodeOpt.orElseGet(() -> legacyAliasCode(businessName));
                log.debug("CHAT row={} partner_code={} via={}", rowNumber, partnerCode, lookupVia);

                LocalDateTime notionCreatedAt = null;
                if (createdAtRaw != null) {
                    try {
                        notionCreatedAt = LocalDateTime.parse(createdAtRaw, NOTION_DATETIME);
                    } catch (Exception e) {
                        // 파싱 실패는 reject 가 아닌 null 처리 (감사 필드 손실은 허용, 매핑 자체는 유효)
                        log.warn("Notion 생성 일시 파싱 실패 row={} value='{}' : {}",
                                rowNumber, createdAtRaw, e.getMessage());
                    }
                }

                Optional<PartnerChatRoomMapping> existing =
                        repository.findByPartnerCodeAndChatRoomName(partnerCode, chatRoomName);
                if (existing.isPresent()) {
                    // snapshot 사업자명만 갱신 (재import 시 partner-service 측 리네임 반영).
                    // 코드 우선 매핑으로 사업자명 누락된 경우 기존 snapshot 유지 (덮어쓰기 회피).
                    if (businessName != null) {
                        existing.get().updateBusinessNameSnapshot(businessName);
                    }
                    repository.save(existing.get());
                    updated++;
                } else {
                    // snapshot 필수 — 코드 우선 매핑으로 사업자명 미공급 시 partnerCode placeholder 사용
                    // (entity invariant 보호, 운영자가 admin UI 에서 추후 사업자명 갱신).
                    String snapshot = businessName != null ? businessName : ("[" + partnerCode + "]");
                    PartnerChatRoomMapping entity = PartnerChatRoomMapping.fromNotionImport(
                            partnerCode, snapshot, chatRoomName, notionCreatedAt);
                    repository.save(entity);
                    inserted++;
                }
            }
        } catch (com.opencsv.exceptions.CsvValidationException ex) {
            throw new IOException("CSV 파싱 실패: " + ex.getMessage(), ex);
        }

        log.info("CHAT 단톡방 매핑 import 완료 — inserted={} updated={} rejected={}",
                inserted, updated, rejected.size());
        return new ChatRoomImportResult(inserted, updated, rejected);
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * 거래처코드가 없는 legacy Notion 행을 보존하기 위한 결정적 alias.
     * 실제 거래처코드와 구분되는 prefix 를 사용하고, 화면에는 snapshot 사업자명을 함께 노출한다.
     */
    static String legacyAliasCode(String businessName) {
        String source = trimToNull(businessName);
        if (source == null) {
            throw new IllegalArgumentException("businessName 필수");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(source.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                hex.append(String.format("%02x", bytes[i]));
            }
            return LEGACY_ALIAS_PREFIX + hex;
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 미지원", ex);
        }
    }
}
