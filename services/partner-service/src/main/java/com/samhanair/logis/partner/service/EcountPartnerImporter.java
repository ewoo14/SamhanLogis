package com.samhanair.logis.partner.service;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MIG-1 PoC — 이카운트 거래처 CSV 17 컬럼 → staging.ecount_partner_raw + partners 일괄 적재.
 *
 * <p>spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (D-MIG-1-01 ~ D-MIG-1-13).
 *
 * <p>CSV 포맷 (이카운트 export 특성):
 * <ul>
 *   <li>UTF-8 BOM</li>
 *   <li>row 1 = 메타데이터 ("데이터관리>거래처-Excel다운로드")</li>
 *   <li>row 2 = 17 컬럼 한글 헤더 + trailing 빈 18번째 컬럼</li>
 *   <li>row 3+ = 데이터, 모든 셀 값에 trailing tab (\t) 포함 — {@link #stripCell(String)} 일괄 제거</li>
 * </ul>
 *
 * <p>흐름 (row 단위):
 * <ol>
 *   <li>{@link #computeFileHash(byte[])} — SHA-256(file content) → 멱등 키</li>
 *   <li>CSV 파싱 (OpenCSV + BOMInputStream)</li>
 *   <li>{@link #stagingUpsert} — staging.ecount_partner_raw 17 raw 컬럼 적재 (멱등)</li>
 *   <li>{@link #classify} — REJECT_NAME_NULL / SKIPPED_PLACEHOLDER / NORMAL 분류</li>
 *   <li>NORMAL → Partner UPSERT (partner_code 기준)</li>
 *   <li>staging transform_status / target_partner_id 갱신</li>
 * </ol>
 *
 * <p>멱등성: 동일 파일 재실행 시 (source_file_hash, source_row_no) ON CONFLICT 로 staging UPDATE,
 * Partner 도 partner_code 기준 자동 dedupe. 다른 파일 동일 partner_code → 최신 import 가 승.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountPartnerImporter {

    /** 이카운트 17 컬럼 한글 헤더 (row 2 검증용). 18번째 trailing 빈 컬럼은 무시. */
    private static final String[] EXPECTED_HEADERS = {
            "거래처코드", "등록일자", "담당자명", "종사업장번호", "거래처명", "대표자명",
            "주소1", "전화번호", "핸드폰번호", "검색창내용", "특이사항", "그룹",
            "사용구분", "이체정보", "여신한도", "최초작성일자"
    };

    /** 거래처코드 placeholder 패턴 (이카운트 운영 데이터의 가짜/임시 값). */
    private static final java.util.regex.Pattern PLACEHOLDER_CODE =
            java.util.regex.Pattern.compile("^([-]|0+|0+[-]?0+[-]?0+|[A-Za-z]?\\d{0,4}|-)$");

    /** 등록일자 YYYYMMDD 파서. */
    private static final DateTimeFormatter REGISTRATION_DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd", Locale.KOREAN);

    /** reject sample 최대 건수 (응답 페이로드 가드). */
    private static final int REJECT_SAMPLE_MAX = 20;

    private final PartnerRepository partnerRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    /**
     * CSV 스트림을 적재한다.
     *
     * @param csv UTF-8 CSV 입력 스트림 (BOM 포함 가능). 본 메서드 내부에서 모두 메모리에 읽어 hash + 재파싱.
     *            호출 측에서 close 책임.
     * @param actorUserId 작업자 user id (audit imported_by)
     * @return 5 분류 카운트 + sample reject + sourceFileHash
     */
    public EcountPartnerImportResult importCsv(InputStream csv, String actorUserId) {
        if (csv == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        byte[] content;
        try {
            content = readAllBytes(csv);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 읽기 실패: " + ex.getMessage(), ex);
        }
        if (content.length == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
        }

        String sourceFileHash = computeFileHash(content);

        int totalRows = 0;
        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        int activeCount = 0;
        int suspendedCount = 0;
        List<EcountPartnerImportResult.RejectedRow> rejectedSample = new ArrayList<>();

        try (BOMInputStream bomFree = BOMInputStream.builder()
                .setInputStream(new ByteArrayInputStream(content)).get();
             InputStreamReader isr = new InputStreamReader(bomFree, StandardCharsets.UTF_8);
             BufferedReader br = new BufferedReader(isr);
             CSVReader reader = new CSVReader(br)) {

            // row 1: 메타데이터 ("데이터관리>거래처-Excel다운로드") — skip
            String[] meta = reader.readNext();
            if (meta == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
            }
            // row 2: 한글 헤더 — 검증
            String[] header = reader.readNext();
            if (header == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 헤더 누락");
            }
            validateHeader(header);

            String[] row;
            int rowNo = 2; // 헤더가 row 2, 데이터는 row 3+
            while ((row = reader.readNext()) != null) {
                rowNo++;
                if (isAllBlank(row)) {
                    continue; // trailing 빈 행 — total 에 포함 안 함
                }
                totalRows++;

                String[] cells = normalizeRow(row);
                String rawPartnerCode = cells[0];
                String rawName = cells[4];

                // staging 적재 (모든 row, 멱등)
                stagingUpsert(sourceFileHash, rowNo, cells, actorUserId);

                // 분류
                Classification c = classify(rawPartnerCode, rawName);
                switch (c.kind) {
                    case REJECT_NAME_NULL -> {
                        rejectedNullName++;
                        updateStagingStatus(sourceFileHash, rowNo, "REJECT_NAME_NULL",
                                "거래처명 빈값", null);
                        addRejectSample(rejectedSample, rowNo, "REJECT_NAME_NULL",
                                rawPartnerCode, rawName);
                    }
                    case SKIPPED_PLACEHOLDER -> {
                        skippedPlaceholder++;
                        updateStagingStatus(sourceFileHash, rowNo, "SKIPPED_PLACEHOLDER",
                                "거래처코드 placeholder (" + rawPartnerCode + ")", null);
                        addRejectSample(rejectedSample, rowNo, "SKIPPED_PLACEHOLDER",
                                rawPartnerCode, rawName);
                    }
                    case NORMAL -> {
                        UpsertResult ur = upsertPartner(cells, c.effectiveCode);
                        if (ur.isNew) {
                            imported++;
                        } else {
                            updated++;
                        }
                        if (ur.status == PartnerStatus.ACTIVE) {
                            activeCount++;
                        } else if (ur.status == PartnerStatus.SUSPENDED) {
                            suspendedCount++;
                        }
                        updateStagingStatus(sourceFileHash, rowNo,
                                ur.isNew ? "IMPORTED" : "UPDATED",
                                null, ur.partnerId);
                    }
                }
            }
        } catch (IOException | CsvValidationException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "CSV 파싱 실패: " + ex.getMessage(), ex);
        }

        log.info("MIG-1 import 완료 — total={} imported={} updated={} rejectedNullName={} "
                        + "skippedPlaceholder={} ACTIVE={} SUSPENDED={} hash={} actor={}",
                totalRows, imported, updated, rejectedNullName, skippedPlaceholder,
                activeCount, suspendedCount, sourceFileHash, actorUserId);

        return new EcountPartnerImportResult(totalRows, imported, updated, rejectedNullName,
                skippedPlaceholder, activeCount, suspendedCount, sourceFileHash, rejectedSample);
    }

    // ============================================================
    // 내부 로직 (package-private — 단위 테스트 직접 호출용)
    // ============================================================

    /** 모든 셀 trailing tab/CR/공백 제거 — 이카운트 export 의 일관 트랩 (D-MIG-1-06). */
    static String stripCell(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\t", "").strip();
    }

    /** 17 컬럼 정규화 (trailing 빈 18 컬럼 무시, 모든 셀 strip). */
    static String[] normalizeRow(String[] raw) {
        String[] out = new String[16];
        for (int i = 0; i < 16; i++) {
            out[i] = i < raw.length ? stripCell(raw[i]) : "";
        }
        return out;
    }

    static boolean isAllBlank(String[] row) {
        for (String c : row) {
            if (c != null && !stripCell(c).isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /** SHA-256 hex (대문자 32 byte = 64 char). 전체 파일 내용 hash → 멱등 키. */
    static String computeFileHash(byte[] content) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(content);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unsupported", ex);
        }
    }

    private void validateHeader(String[] header) {
        for (int i = 0; i < EXPECTED_HEADERS.length; i++) {
            String actual = i < header.length ? stripCell(header[i]) : "";
            if (!EXPECTED_HEADERS[i].equals(actual)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "CSV 헤더 형식 불일치 — 컬럼 " + (i + 1) + " 예상='" + EXPECTED_HEADERS[i]
                                + "' 실제='" + actual + "'");
            }
        }
    }

    /** placeholder / 빈값 / 일반 분류. */
    Classification classify(String rawCode, String rawName) {
        if (rawName == null || rawName.isEmpty()) {
            return new Classification(Kind.REJECT_NAME_NULL, null);
        }
        if (rawCode == null || rawCode.isEmpty() || PLACEHOLDER_CODE.matcher(rawCode).matches()) {
            return new Classification(Kind.SKIPPED_PLACEHOLDER, null);
        }
        return new Classification(Kind.NORMAL, rawCode);
    }

    static PartnerStatus mapStatus(String rawUsageFlag) {
        if ("YES".equalsIgnoreCase(rawUsageFlag)) {
            return PartnerStatus.ACTIVE;
        }
        return PartnerStatus.SUSPENDED;
    }

    static BigDecimal parseCreditLimit(String raw) {
        if (raw == null || raw.isEmpty() || "-".equals(raw)) {
            return BigDecimal.ZERO;
        }
        String cleaned = raw.replace(",", "").replace(" ", "");
        try {
            return new BigDecimal(cleaned);
        } catch (NumberFormatException ex) {
            log.warn("MIG-1 여신한도 파싱 실패 — raw='{}' → 0 fallback", raw);
            return BigDecimal.ZERO;
        }
    }

    static LocalDate parseRegistrationDate(String raw) {
        if (raw == null || raw.isEmpty() || "임시".equals(raw)) {
            return null;
        }
        try {
            return LocalDate.parse(raw, REGISTRATION_DATE_FORMAT);
        } catch (Exception ex) {
            log.debug("MIG-1 등록일자 파싱 실패 — raw='{}' → null", raw);
            return null;
        }
    }

    static String nullIfBlank(String s) {
        return (s == null || s.isEmpty()) ? null : s;
    }

    // ============================================================
    // staging 적재 (NamedParameterJdbcTemplate UPSERT)
    // ============================================================

    private static final String STAGING_UPSERT_SQL = """
            INSERT INTO staging.ecount_partner_raw (
              source_file_hash, source_row_no,
              raw_partner_code, raw_registration, raw_manager_name, raw_sub_biz_no,
              raw_name, raw_representative, raw_address1, raw_phone, raw_mobile,
              raw_search_keyword, raw_note, raw_partner_group1, raw_usage_flag,
              raw_transfer_info, raw_credit_limit, raw_first_created,
              transform_status, imported_by
            ) VALUES (
              :hash, :row,
              :c0, :c1, :c2, :c3, :c4, :c5, :c6, :c7, :c8, :c9, :c10, :c11, :c12, :c13, :c14, :c15,
              'PENDING', :actor
            )
            ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
              raw_partner_code   = EXCLUDED.raw_partner_code,
              raw_registration   = EXCLUDED.raw_registration,
              raw_manager_name   = EXCLUDED.raw_manager_name,
              raw_sub_biz_no     = EXCLUDED.raw_sub_biz_no,
              raw_name           = EXCLUDED.raw_name,
              raw_representative = EXCLUDED.raw_representative,
              raw_address1       = EXCLUDED.raw_address1,
              raw_phone          = EXCLUDED.raw_phone,
              raw_mobile         = EXCLUDED.raw_mobile,
              raw_search_keyword = EXCLUDED.raw_search_keyword,
              raw_note           = EXCLUDED.raw_note,
              raw_partner_group1 = EXCLUDED.raw_partner_group1,
              raw_usage_flag     = EXCLUDED.raw_usage_flag,
              raw_transfer_info  = EXCLUDED.raw_transfer_info,
              raw_credit_limit   = EXCLUDED.raw_credit_limit,
              raw_first_created  = EXCLUDED.raw_first_created,
              transform_status   = 'PENDING',
              target_partner_id  = NULL,
              reject_reason      = NULL,
              imported_at        = CURRENT_TIMESTAMP,
              imported_by        = EXCLUDED.imported_by
            """;

    private void stagingUpsert(String hash, int rowNo, String[] c, String actor) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("actor", actor);
        for (int i = 0; i < 16; i++) {
            p.addValue("c" + i, nullIfBlank(c[i]));
        }
        jdbcTemplate.update(STAGING_UPSERT_SQL, p);
    }

    private void updateStagingStatus(String hash, int rowNo, String status, String reason,
                                     java.util.UUID partnerId) {
        jdbcTemplate.update(
                """
                UPDATE staging.ecount_partner_raw
                   SET transform_status = :status,
                       reject_reason    = :reason,
                       target_partner_id = :partnerId
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("partnerId", partnerId)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    // ============================================================
    // partner UPSERT
    // ============================================================

    /**
     * 거래처 UPSERT — partner_code 기준 (= 거래처코드 = bizNo).
     * 동일 transaction 내에서 staging 적재와 묶이지 않도록 row 단위 진행 (대량 import 의 부분 성공 허용).
     */
    @Transactional
    public UpsertResult upsertPartner(String[] cells, String effectiveCode) {
        String name = cells[4];
        String managerName = nullIfBlank(cells[2]);
        String subBizNo = nullIfBlank(cells[3]);
        String representative = nullIfBlank(cells[5]);
        String address1 = nullIfBlank(cells[6]);
        String phone = nullIfBlank(cells[7]);
        String mobile = nullIfBlank(cells[8]);
        String searchKeyword = nullIfBlank(cells[9]);
        String note = nullIfBlank(cells[10]);
        String partnerGroup1 = nullIfBlank(cells[11]);
        String rawUsageFlag = cells[12];
        String transferInfo = nullIfBlank(cells[13]);
        BigDecimal creditLimit = parseCreditLimit(cells[14]);
        LocalDate registrationDate = parseRegistrationDate(cells[1]);
        PartnerStatus status = mapStatus(rawUsageFlag);

        Optional<Partner> existing = partnerRepository.findByPartnerCode(effectiveCode);

        Partner partner;
        boolean isNew;
        if (existing.isPresent()) {
            partner = existing.get();
            partner.updateProfile(name, address1, phone);
            partner.updateBusinessProfile(representative, partner.getBusinessType(),
                    partner.getIndustry(), subBizNo);
            partner.updateContactChannels(partner.getFax(), partner.getEmail(),
                    partner.getEmail2(), mobile);
            partner.updateAddresses(partner.getZipCode1(), address1,
                    partner.getZipCode2(), partner.getAddress2());
            partner.updateSearchKeyword(searchKeyword);
            partner.updateClassification(partnerGroup1, partner.getPartnerGroup2(),
                    partner.getWebsite());
            partner.changeCreditLimit(creditLimit);
            partner.changeRegistrationDate(registrationDate);
            partner.updateTransferInfo(transferInfo);
            partner.updateNote(note);
            partner.updateManagerName(managerName);
            partner.changeStatus(status);
            isNew = false;
        } else {
            partner = Partner.register(effectiveCode, effectiveCode, name, address1, phone, creditLimit);
            partner.updateBusinessProfile(representative, null, null, subBizNo);
            partner.updateContactChannels(null, null, null, mobile);
            partner.updateAddresses(null, address1, null, null);
            partner.updateSearchKeyword(searchKeyword);
            partner.updateClassification(partnerGroup1, null, null);
            partner.changeRegistrationDate(registrationDate);
            partner.updateTransferInfo(transferInfo);
            partner.updateNote(note);
            partner.updateManagerName(managerName);
            partner.changeStatus(status);
            isNew = true;
        }
        partner = partnerRepository.save(partner);
        return new UpsertResult(partner.getId(), isNew, status);
    }

    // ============================================================
    // 보조
    // ============================================================

    private static void addRejectSample(List<EcountPartnerImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountPartnerImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }

    private static byte[] readAllBytes(InputStream in) throws IOException {
        return in.readAllBytes();
    }

    /** 분류 결과. */
    record Classification(Kind kind, String effectiveCode) {
    }

    enum Kind {
        REJECT_NAME_NULL, SKIPPED_PLACEHOLDER, NORMAL
    }

    /** Partner UPSERT 결과. */
    public record UpsertResult(java.util.UUID partnerId, boolean isNew, PartnerStatus status) {
    }
}
