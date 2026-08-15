package com.samhanair.logis.partner.service;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.dto.BlockedPartnerImportResult;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.stereotype.Service;

/**
 * Phase 10 PR-D Part B — Notion 발송금지 CSV (이카운트 사업자명 + 생성 일시) → BlockedPartner row import.
 *
 * <p>Samhan Public legacy 발송금지 거래처 — Notion export = UTF-8 BOM + 한국어 datetime ("2026년 4월 26일
 * 오전 7:36") 포맷. {@link BOMInputStream} 으로 BOM 제거 후 OpenCSV 로 파싱.
 *
 * <p>매핑 우선순위 (TM PR-D Part 3 — 사용자 명시 "거래처명이 아니라 거래처코드로 매핑"):
 * <ol>
 *   <li>{@code 거래처코드} 컬럼이 있으면 {@link PartnerService#findByCodeForLookup(String)} 로 즉시
 *       검증 (LIKE 모호성 회피, 정확 매칭).</li>
 *   <li>코드가 비거나 검증 실패 시 {@code 이카운트 사업자명} →
 *       {@link PartnerService#findByNameForLookup(String)} fallback.</li>
 *   <li>둘 다 실패해도 legacy Notion 원본 보존을 위해 사업자명 alias 로 BLOCK row 를 저장한다.</li>
 * </ol>
 *
 * <p>흐름 (row 단위):
 * <ol>
 *   <li>"이카운트 사업자명" + "생성 일시" + (옵션) "거래처코드" 추출</li>
 *   <li>코드 우선 → 사업자명 fallback 으로 Partner resolve</li>
 *   <li>한국어 datetime 파싱 실패 시 reject (PARSE_ERROR), 성공 시 LocalDateTime</li>
 *   <li>이미 차단된 partnerCode 는 alreadyBlocked++ 로 분류 (skip — idempotent)</li>
 *   <li>신규 row → {@link PartnerBlockService#block(String, String, LocalDateTime, String, String)}
 *       호출, source=NOTION_IMPORT, snapshot=CSV 입력 사업자명 (없으면 partnerCode placeholder)</li>
 * </ol>
 *
 * <p>row-level transaction 분리 — 한 row 의 CONFLICT 가 다른 row 의 import 를 차단하지 않도록 본
 * service 자체는 {@code @Transactional} 을 메서드 단위로 걸지 않고, 각 block() 호출이 자체 transaction
 * 으로 격리된다 (PartnerBlockService.block 의 @Transactional 가 row 단위).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerBlockImportService {

    /** Notion export datetime pattern — "2026년 4월 26일 오전 7:36" (Locale.KOREAN). */
    private static final DateTimeFormatter NOTION_DATETIME =
            DateTimeFormatter.ofPattern("yyyy년 M월 d일 a h:mm", Locale.KOREAN);

    private static final String COL_BUSINESS_NAME = "이카운트 사업자명";
    private static final String COL_CREATED_AT = "생성 일시";
    /** TM PR-D Part 3 — 거래처코드 우선 매핑 컬럼 (한국어 헤더). 옵션 (미존재 시 사업자명 fallback). */
    private static final String COL_PARTNER_CODE = "거래처코드";
    /** TM PR-D Part 3 — 거래처코드 우선 매핑 컬럼 (영문 헤더 대안). */
    private static final String COL_PARTNER_CODE_EN = "partner_code";
    private static final String LEGACY_ALIAS_PREFIX = "LEGACY-NAME-";

    private final PartnerService partnerService;
    private final PartnerBlockService blockService;

    /**
     * CSV 스트림을 읽어 BLOCK row 일괄 등록.
     *
     * @param csv UTF-8 CSV 입력 스트림 (BOM 포함 가능). 호출 측에서 close 책임.
     * @param actorUserId 작업자 (audit created_by — Spring Data Auditing 가 헤더로 자동 적용되므로
     *                    참고용)
     * @return 4 카테고리 결과 (totalRows / imported / alreadyBlocked / rejected)
     */
    public BlockedPartnerImportResult importCsv(InputStream csv, String actorUserId) {
        if (csv == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }

        int total = 0;
        int imported = 0;
        int alreadyBlocked = 0;
        List<BlockedPartnerImportResult.RejectedRow> rejected = new ArrayList<>();

        try (BOMInputStream bomFree = BOMInputStream.builder().setInputStream(csv).get();
             InputStreamReader isr = new InputStreamReader(bomFree, StandardCharsets.UTF_8);
             BufferedReader br = new BufferedReader(isr);
             CSVReader reader = new CSVReader(br)) {

            String[] header = reader.readNext();
            if (header == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 헤더 누락");
            }
            int colName = indexOf(header, COL_BUSINESS_NAME);
            int colCreated = indexOf(header, COL_CREATED_AT);
            // TM PR-D Part 3 — 거래처코드 컬럼은 옵션 (없으면 -1 → 사업자명 fallback only).
            int colCode = indexOf(header, COL_PARTNER_CODE);
            if (colCode < 0) {
                colCode = indexOf(header, COL_PARTNER_CODE_EN);
            }
            if (colName < 0 || colCreated < 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "CSV 헤더 형식 불일치 — '이카운트 사업자명' / '생성 일시' 필요");
            }

            String[] row;
            int rowNum = 0;
            while ((row = reader.readNext()) != null) {
                rowNum++;
                total++;
                String businessName = safeGet(row, colName);
                String createdAtRaw = safeGet(row, colCreated);
                String inputPartnerCode = colCode >= 0 ? safeGet(row, colCode) : null;
                if (inputPartnerCode != null && inputPartnerCode.isBlank()) {
                    inputPartnerCode = null;
                }

                if ((businessName == null || businessName.isBlank()) && inputPartnerCode == null) {
                    rejected.add(new BlockedPartnerImportResult.RejectedRow(
                            rowNum, businessName, "PARSE_ERROR: 사업자명/거래처코드 모두 누락"));
                    continue;
                }

                LocalDateTime blockedAt;
                try {
                    blockedAt = parseNotionDateTime(createdAtRaw);
                } catch (DateTimeParseException ex) {
                    rejected.add(new BlockedPartnerImportResult.RejectedRow(
                            rowNum, businessName, "PARSE_ERROR: 생성 일시 형식 오류 (" + createdAtRaw + ")"));
                    continue;
                }

                // TM PR-D Part 3 — 거래처코드 우선, 미공급/검증실패 시 사업자명 fallback.
                Optional<Partner> lookup = Optional.empty();
                String lookupVia = null;
                if (inputPartnerCode != null) {
                    lookup = partnerService.findByCodeForLookup(inputPartnerCode);
                    lookupVia = "거래처코드";
                }
                if (lookup.isEmpty() && businessName != null && !businessName.isBlank()) {
                    lookup = partnerService.findByNameForLookup(businessName);
                    lookupVia = inputPartnerCode != null
                            ? "거래처코드 미매칭 → 사업자명 fallback" : "사업자명";
                }
                if (lookup.isEmpty() && (businessName == null || businessName.isBlank())) {
                    rejected.add(new BlockedPartnerImportResult.RejectedRow(
                            rowNum, businessName,
                            "LOOKUP_MISS: partnerCode 매핑 실패 및 사업자명 alias 생성 불가 (코드="
                                    + inputPartnerCode + ")"));
                    continue;
                }
                String resolvedPartnerCode = lookup.map(Partner::getPartnerCode)
                        .orElseGet(() -> legacyAliasCode(businessName));
                if (blockService.isBlocked(resolvedPartnerCode)) {
                    alreadyBlocked++;
                    continue;
                }

                // snapshot — 사업자명 우선, 미공급 시 partnerCode placeholder.
                String snapshot = (businessName != null && !businessName.isBlank())
                        ? businessName : ("[" + resolvedPartnerCode + "]");
                try {
                    if (lookup.isPresent()) {
                        blockService.block(resolvedPartnerCode, null, blockedAt,
                                "NOTION_IMPORT", snapshot);
                    } else {
                        blockService.blockLegacySnapshot(resolvedPartnerCode, null, blockedAt,
                                "NOTION_IMPORT", snapshot);
                    }
                    imported++;
                    log.debug("BLOCK row={} partner_code={} via={}",
                            rowNum, resolvedPartnerCode, lookupVia);
                } catch (BusinessException ex) {
                    // 동시 import / race condition 등 — CONFLICT 시 alreadyBlocked 분류
                    if (ex.getErrorCode() == ErrorCode.CONFLICT) {
                        alreadyBlocked++;
                    } else {
                        rejected.add(new BlockedPartnerImportResult.RejectedRow(
                                rowNum, businessName, "DUPLICATE: " + ex.getMessage()));
                    }
                }
            }
        } catch (IOException | CsvValidationException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파싱 실패: " + ex.getMessage(), ex);
        }

        log.info("BLOCK CSV import 완료 — total={}, imported={}, alreadyBlocked={}, rejected={}, actor={}",
                total, imported, alreadyBlocked, rejected.size(), actorUserId);
        return new BlockedPartnerImportResult(total, imported, alreadyBlocked, rejected);
    }

    /**
     * Notion datetime 파싱 (한국어 표기 또는 ISO UTC/offset 표기 → LocalDateTime).
     * 빈 문자열 시 now() fallback.
     *
     * <p>visibility = package-private — 테스트 직접 호출용.
     */
    LocalDateTime parseNotionDateTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return LocalDateTime.now();
        }
        String value = raw.trim();
        try {
            return LocalDateTime.parse(value, NOTION_DATETIME);
        } catch (DateTimeParseException koreanFormatFailure) {
            // 실제 export의 "2026-04-25 22:36:20Z"처럼 날짜와 시간 사이가 공백인
            // ISO offset 형식도 허용한다. 한국어 표기 및 BaseEntity LocalDateTime 축과
            // 일치하도록 KST wall-clock 값으로 저장한다.
            String iso = value.replaceFirst("^(\\d{4}-\\d{2}-\\d{2})\\s+", "$1T");
            return OffsetDateTime.parse(iso).withOffsetSameInstant(ZoneOffset.ofHours(9)).toLocalDateTime();
        }
    }

    private int indexOf(String[] header, String column) {
        for (int i = 0; i < header.length; i++) {
            if (header[i] != null && column.equals(header[i].trim())) {
                return i;
            }
        }
        return -1;
    }

    private String safeGet(String[] row, int idx) {
        if (idx < 0 || idx >= row.length) {
            return null;
        }
        return row[idx] == null ? null : row[idx].trim();
    }

    static String legacyAliasCode(String businessName) {
        String source = safeBusinessName(businessName);
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

    private static String safeBusinessName(String businessName) {
        if (businessName == null || businessName.isBlank()) {
            throw new IllegalArgumentException("businessName 필수");
        }
        return businessName.trim();
    }
}
