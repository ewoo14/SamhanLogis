package com.samhanair.logis.partner.service;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.common.ecount.io.EcountXlsxSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.dto.EcountPartnerRejectionPage;
import com.samhanair.logis.partner.realtime.PartnerListRealtime;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
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

    /**
     * 거래처코드 placeholder 패턴 (이카운트 운영 데이터의 가짜/임시 값).
     *
     * <p>5-team 리뷰 cycle 1 정정 (2026-05-19): 기존 정규식 `[A-Za-z]?\d{0,4}` 가
     * over-aggressive 하여 1~4자리 숫자/운영 코드 (`0004` 정효림-개인, `01` 국민건강보험공단,
     * `1` 세금계산서 카드매출중복용, `1123` 대덕구 건강검진센터, `1212` 수석공장,
     * `7002`/`7006`/`7251` 등 8건) 를 placeholder 로 오판
     * → SKIPPED. narrow 정규식 으로 교체.
     *
     * <p>매칭 대상 (placeholder 로 판정):
     * <ul>
     *   <li>{@code -} (단일 dash)
     *   <li>{@code 0+} (0 만 연속, "00", "0000" 등)
     *   <li>{@code 0+[- ]?0+[- ]?0+} (0-0-0 / 000-00-00000 사업자번호형 placeholder)
     * </ul>
     */
    private static final java.util.regex.Pattern PLACEHOLDER_CODE =
            java.util.regex.Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");

    /** 등록일자 YYYYMMDD 파서. */
    private static final DateTimeFormatter REGISTRATION_DATE_FORMAT =
            DateTimeFormatter.ofPattern("uuuuMMdd", Locale.KOREAN)
                    .withResolverStyle(java.time.format.ResolverStyle.STRICT);
    private static final Pattern FIRST_CREATED_PATTERN = Pattern.compile(
            "^(\\d{4}/\\d{2}/\\d{2})\\s+(오전|오후)\\s+(\\d{1,2}):(\\d{2}):(\\d{2})$");

    /** reject sample 최대 건수 (응답 페이로드 가드). */
    private static final int REJECT_SAMPLE_MAX = 20;

    private static final String[] XLSX_HEADERS = EXPECTED_HEADERS;

    private final PartnerRepository partnerRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final CollectionRealtimePublisher collectionRealtimePublisher;

    /** 행 단위 UPSERT를 Spring 트랜잭션 프록시로 호출하기 위한 자기 참조. */
    @Lazy
    @Autowired
    private EcountPartnerImporter transactionalProxy;

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
        int heldParseFailureRows = 0;
        int infrastructureFailureRows = 0;
        List<EcountPartnerImportResult.RejectedRow> rejectedSample = new ArrayList<>();
        List<EcountPartnerImportResult.RejectedRow> heldSample = new ArrayList<>();
        List<EcountPartnerImportResult.RejectedRow> infrastructureFailureSample = new ArrayList<>();

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
                        UpsertResult ur;
                        try {
                            ur = upsertPartnerInRowTransaction(cells, c.effectiveCode);
                        } catch (Partner.InvalidImportedCreditLimitException ex) {
                            heldParseFailureRows++;
                            addRejectSample(heldSample, rowNo, "INPUT_VALIDATION", rawPartnerCode, rawName);
                            updateStagingStatus(sourceFileHash, rowNo, "PENDING", "INPUT_VALIDATION", null);
                            log.warn("MIG-1 import 행 입력 검증 실패 — row={} partnerCode={} reason=INPUT_VALIDATION",
                                    rowNo, rawPartnerCode, ex);
                            continue;
                        } catch (DataAccessException ex) {
                            String reason = failureReason(ex);
                            if ("DB_CONSTRAINT".equals(reason)) {
                                heldParseFailureRows++;
                                addRejectSample(heldSample, rowNo, reason, rawPartnerCode, rawName);
                            } else {
                                infrastructureFailureRows++;
                                addRejectSample(infrastructureFailureSample, rowNo, reason, rawPartnerCode, rawName);
                            }
                            updateStagingStatus(sourceFileHash, rowNo, "PENDING", reason, null);
                            log.warn("MIG-1 import 행 DB 적재 실패 — row={} partnerCode={} reason={}",
                                    rowNo, rawPartnerCode, reason, ex);
                            continue;
                        }
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
        } finally {
            if (imported + updated > 0) {
                collectionRealtimePublisher.publishChange(
                        PartnerListRealtime.CHANNEL_ID,
                        PartnerListRealtime.EVENT_CHANGED,
                        Map.of("changeType", "BULK_UPDATED"));
            }
        }

        log.info("MIG-1 import 완료 — total={} imported={} updated={} rejectedNullName={} "
                        + "skippedPlaceholder={} heldParseFailureRows={} ACTIVE={} SUSPENDED={} hash={} actor={}",
                totalRows, imported, updated, rejectedNullName, skippedPlaceholder,
                heldParseFailureRows, activeCount, suspendedCount, sourceFileHash, actorUserId);

        return new EcountPartnerImportResult(totalRows, imported, updated, rejectedNullName,
                skippedPlaceholder, activeCount, suspendedCount, sourceFileHash, rejectedSample,
                0, heldParseFailureRows, heldSample, infrastructureFailureRows,
                infrastructureFailureSample, infrastructureFailureRows > 0, 0, 0);
    }

    /**
     * 이카운트 정본 XLSX를 관리자 적재 경로로 반영한다.
     * 메타 1행/헤더 1행은 공통 XLSX 파서가 처리하고, A열 timestamp만 있는 trailer와
     * 변환 실패 행은 partners에 쓰지 않고 staging에 증거로 남긴다.
     */
    public EcountPartnerImportResult importXlsx(InputStream xlsx, String actorUserId) {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(xlsx, XLSX_HEADERS);
        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        int activeCount = 0;
        int suspendedCount = 0;
        int excludedTrailer = 0;
        int registrationDateParsedCount = 0;
        int createdAtLoadTimeCount = 0;
        int heldParseFailureRows = 0;
        int infrastructureFailureRows = 0;
        List<EcountPartnerImportResult.RejectedRow> rejected = new ArrayList<>();
        List<EcountPartnerImportResult.RejectedRow> held = new ArrayList<>();
        List<EcountPartnerImportResult.RejectedRow> infrastructureFailures = new ArrayList<>();
        LocalDateTime loadTimestamp = LocalDateTime.now();

        for (EcountXlsxSupport.ParsedRow parsedRow : parsed.rows()) {
            int rowNo = parsedRow.sourceRowNo();
            String[] cells = parsedRow.cells();
            if (isTrailerRow(cells)) {
                excludedTrailer++;
                addRejectSample(rejected, rowNo, "EXCLUDED_TRAILER", cells[0], "");
                continue;
            }

            stagingUpsert(parsed.sourceFileHash(), rowNo, cells, actorUserId);
            // 기초거래처 정본은 '-'와 비숫자 partner_code도 업무 식별자로 유효하다.
            Classification classification = classifyMasterRow(cells[0], cells[4]);
            if (classification.kind == Kind.REJECT_NAME_NULL) {
                rejectedNullName++;
                updateStagingStatus(parsed.sourceFileHash(), rowNo, "REJECT_NAME_NULL",
                        "거래처명 빈값", null);
                addRejectSample(rejected, rowNo, "REJECT_NAME_NULL", cells[0], cells[4]);
                continue;
            }
            if (classification.kind == Kind.SKIPPED_PLACEHOLDER) {
                skippedPlaceholder++;
                updateStagingStatus(parsed.sourceFileHash(), rowNo, "SKIPPED_PLACEHOLDER",
                        "거래처코드 placeholder (" + cells[0] + ")", null);
                addRejectSample(rejected, rowNo, "SKIPPED_PLACEHOLDER", cells[0], cells[4]);
                continue;
            }
            LocalDate registrationDate = parseRegistrationDate(cells[1]);
            if (registrationDate == null) createdAtLoadTimeCount++;
            else registrationDateParsedCount++;
            // 유효한 등록일자는 created_at과 registration_date에 함께 보존한다.
            // 공란/실패는 registration_date=null, created_at=이번 배치의 단일 적재 시각이다.
            UpsertResult result;
            try {
                result = upsertPartnerInRowTransaction(cells, classification.effectiveCode,
                        registrationDate, registrationDate == null ? loadTimestamp : registrationDate.atStartOfDay());
            } catch (Partner.InvalidImportedCreditLimitException ex) {
                heldParseFailureRows++;
                addRejectSample(held, rowNo, "INPUT_VALIDATION", cells[0], cells[4]);
                updateStagingStatus(parsed.sourceFileHash(), rowNo, "PENDING", "INPUT_VALIDATION", null);
                log.warn("MIG-1 XLSX import 행 입력 검증 실패 — row={} partnerCode={} reason=INPUT_VALIDATION",
                        rowNo, cells[0], ex);
                continue;
            } catch (DataAccessException ex) {
                String reason = failureReason(ex);
                if ("DB_CONSTRAINT".equals(reason)) {
                    heldParseFailureRows++;
                    addRejectSample(held, rowNo, reason, cells[0], cells[4]);
                } else {
                    infrastructureFailureRows++;
                    addRejectSample(infrastructureFailures, rowNo, reason, cells[0], cells[4]);
                }
                updateStagingStatus(parsed.sourceFileHash(), rowNo, "PENDING", reason, null);
                log.warn("MIG-1 XLSX import 행 DB 적재 실패 — row={} partnerCode={} reason={}",
                        rowNo, cells[0], reason, ex);
                continue;
            }
            if (result.isNew) imported++; else updated++;
            if (result.status == PartnerStatus.ACTIVE) activeCount++; else if (result.status == PartnerStatus.SUSPENDED) suspendedCount++;
            updateStagingStatus(parsed.sourceFileHash(), rowNo, result.isNew ? "IMPORTED" : "UPDATED",
                    null, result.partnerId);
        }
        if (imported + updated > 0) {
            collectionRealtimePublisher.publishChange(PartnerListRealtime.CHANNEL_ID,
                    PartnerListRealtime.EVENT_CHANGED, Map.of("changeType", "BULK_UPDATED"));
        }
        return new EcountPartnerImportResult(parsed.dataRowCount() - excludedTrailer, imported, updated,
                rejectedNullName, skippedPlaceholder, activeCount, suspendedCount, parsed.sourceFileHash(),
                rejected, excludedTrailer, heldParseFailureRows, held, infrastructureFailureRows,
                infrastructureFailures, infrastructureFailureRows > 0,
                registrationDateParsedCount, createdAtLoadTimeCount);
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
        if (raw == null || raw.isBlank() || "-".equals(raw.strip())) {
            return null;
        }
        String cleaned = raw.replace(",", "").replace(" ", "").replace("원", "");
        try {
            return new BigDecimal(cleaned);
        } catch (NumberFormatException ex) {
            // 필드 단위 실패: 거래처 행은 적재하고 여신한도만 null로 둔다.
            return null;
        }
    }

    /**
     * 등록일자 자유 입력 파서.
     * 지원 형식은 YYYYMMDD, YYYY-MM-DD, YYYY.MM.DD, YY.MM.DD, YYMMDD이다.
     * YY는 업무 데이터의 관행에 따라 2000년대로 해석한다(26 -> 2026).
     * 해석이 틀린 경우에도 staging의 raw_registration 원문으로 규칙 변경 후 재파싱할 수 있다.
     */
    static LocalDate parseRegistrationDate(String raw) {
        if (raw == null || raw.isBlank() || "임시".equals(raw.strip())) return null;
        String digits = raw.strip().replace("-", "").replace(".", "");
        try {
            if (digits.matches("\\d{8}")) {
                return LocalDate.parse(digits, REGISTRATION_DATE_FORMAT);
            }
            if (digits.matches("\\d{6}")) {
                int year = 2000 + Integer.parseInt(digits.substring(0, 2));
                return LocalDate.of(year, Integer.parseInt(digits.substring(2, 4)),
                        Integer.parseInt(digits.substring(4, 6)));
            }
        } catch (RuntimeException ex) {
            return null;
        }
        return null;
    }

    /** 최초작성일자는 audit created_at에 넣지 않고 형식만 검증하며 raw는 staging에 보존한다. */
    static LocalDateTime parseFirstCreated(String raw) {
        if (raw == null || raw.isBlank()) return null;
        Matcher matcher = FIRST_CREATED_PATTERN.matcher(raw.strip().replaceAll("\\s+", " "));
        if (!matcher.matches()) {
            throw new IllegalArgumentException("최초작성일자 파싱 실패: raw='" + raw + "'");
        }
        LocalDate date;
        try {
            date = LocalDate.parse(matcher.group(1).replace("/", "-"));
            int hour = Integer.parseInt(matcher.group(3));
            if (hour < 1 || hour > 12) throw new IllegalArgumentException("시각 범위 오류");
            if ("오후".equals(matcher.group(2)) && hour < 12) hour += 12;
            if ("오전".equals(matcher.group(2)) && hour == 12) hour = 0;
            return LocalDateTime.of(date, LocalTime.of(hour, Integer.parseInt(matcher.group(4)), Integer.parseInt(matcher.group(5))));
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("최초작성일자 파싱 실패: raw='" + raw + "'", ex);
        }
    }

    static boolean isTrailerRow(String[] cells) {
        if (cells.length < 16 || cells[0].isBlank()) return false;
        if (!cells[0].matches("\\d{4}/\\d{2}/\\d{2}\\s+(오전|오후)\\s+\\d{1,2}:\\d{2}:\\d{2}")) return false;
        for (int i = 1; i < cells.length; i++) if (!cells[i].isBlank()) return false;
        return true;
    }

    static Classification classifyMasterRow(String rawCode, String rawName) {
        if (rawName == null || rawName.isBlank()) {
            return new Classification(Kind.REJECT_NAME_NULL, null);
        }
        if (rawCode == null || rawCode.isBlank()) {
            return new Classification(Kind.SKIPPED_PLACEHOLDER, null);
        }
        return new Classification(Kind.NORMAL, rawCode);
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

    /** 적재 진입점에서 호출하는 행 단위 트랜잭션 경계. 단위 테스트의 직접 인스턴스도 지원한다. */
    private UpsertResult upsertPartnerInRowTransaction(String[] cells, String effectiveCode) {
        EcountPartnerImporter target = transactionalProxy == null ? this : transactionalProxy;
        return target.upsertPartner(cells, effectiveCode);
    }

    /** 적재 진입점에서 호출하는 행 단위 트랜잭션 경계. 단위 테스트의 직접 인스턴스도 지원한다. */
    private UpsertResult upsertPartnerInRowTransaction(String[] cells, String effectiveCode,
                                                       LocalDate registrationDate,
                                                       LocalDateTime createdAt) {
        EcountPartnerImporter target = transactionalProxy == null ? this : transactionalProxy;
        return target.upsertPartner(cells, effectiveCode, registrationDate, createdAt);
    }

    /**
     * 거래처 UPSERT — partner_code 기준 (= 거래처코드 = bizNo).
     * 이카운트 적재 갱신 정책: name/대표자/주소/연락처/검색어/메모/담당자/그룹1/
     * registration_date/transfer_info/credit_limit만 원천으로 덮어쓴다. status는 기존 행 보존,
     * outstanding_balance 및 partner_group2 등 운영·거래 결과 필드는 덮어쓰지 않는다.
     * 동일 transaction 내에서 staging 적재와 묶이지 않도록 row 단위 진행 (대량 import 의 부분 성공 허용).
     */
    @Transactional
    public UpsertResult upsertPartner(String[] cells, String effectiveCode) {
        LocalDate registrationDate = parseRegistrationDate(cells[1]);
        LocalDateTime createdAt = registrationDate == null
                ? LocalDateTime.now() : registrationDate.atStartOfDay();
        return upsertPartner(cells, effectiveCode, registrationDate, createdAt);
    }

    @Transactional
    public UpsertResult upsertPartner(String[] cells, String effectiveCode,
                                      LocalDate registrationDate, LocalDateTime createdAt) {
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
        PartnerStatus status = mapStatus(rawUsageFlag);

        Optional<Partner> existing = partnerRepository.findByPartnerCode(effectiveCode);
        if (existing.isEmpty()) {
            existing = partnerRepository.findByPartnerCodeIncludingDeleted(effectiveCode);
        }

        Partner partner;
        boolean isNew;
        if (existing.isPresent()) {
            partner = existing.get();
            if (Boolean.TRUE.equals(partner.getIsDeleted())) {
                partner.markRestored();
            }
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
            // 이관 정책: credit_limit은 원천 숫자/빈칸(null)을 그대로 반영한다.
            // outstanding_balance, status, partner_group2 등 운영/거래 결과 필드는 덮어쓰지 않는다.
            partner.replaceCreditLimitFromImport(creditLimit);
            partner.changeRegistrationDate(registrationDate);
            if (registrationDate != null) {
                partner.overrideCreatedAtForImport(registrationDate.atStartOfDay());
            }
            partner.updateTransferInfo(transferInfo);
            partner.updateNote(note);
            partner.updateManagerName(managerName);
            // 기존 비활성 거래처를 파일 YES만으로 되살리지 않는다.
            isNew = false;
        } else {
            partner = Partner.register(effectiveCode, effectiveCode, name, address1, phone, creditLimit);
            partner.overrideCreatedAtForImport(createdAt);
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
        if (registrationDate != null) {
            partnerRepository.overrideCreatedAtForImport(partner.getId(), registrationDate.atStartOfDay());
        }
        return new UpsertResult(partner.getId(), isNew, partner.getStatus());
    }

    // ============================================================
    // 보조
    // ============================================================

    /** 대량 거부·보류 행을 응답 본문과 분리해 페이지 단위로 조회한다. */
    public EcountPartnerRejectionPage findRejectionPage(String sourceFileHash, int page, int size) {
        if (sourceFileHash == null || !sourceFileHash.matches("[0-9A-Fa-f]{64}")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "sourceFileHash 형식이 올바르지 않습니다");
        }
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);
        MapSqlParameterSource params = new MapSqlParameterSource("hash", sourceFileHash)
                .addValue("limit", safeSize).addValue("offset", safePage * safeSize);
        long total = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM staging.ecount_partner_raw "
                        + "WHERE source_file_hash = :hash AND reject_reason IS NOT NULL",
                params, Long.class);
        List<EcountPartnerImportResult.RejectedRow> items = jdbcTemplate.query(
                "SELECT source_row_no, reject_reason, raw_partner_code, raw_name "
                        + "FROM staging.ecount_partner_raw "
                        + "WHERE source_file_hash = :hash AND reject_reason IS NOT NULL "
                        + "ORDER BY source_row_no LIMIT :limit OFFSET :offset",
                params, (rs, rowNum) -> new EcountPartnerImportResult.RejectedRow(
                        rs.getInt("source_row_no"), rs.getString("reject_reason"),
                        rs.getString("raw_partner_code"), rs.getString("raw_name")));
        int totalPages = (int) Math.ceil((double) total / safeSize);
        return new EcountPartnerRejectionPage(sourceFileHash, safePage, safeSize, total,
                totalPages, items);
    }

    /**
     * 행 적재 예외를 데이터 축과 인프라 축으로 나눈다.
     *
     * <p>Spring의 명시적 제약 위반 타입만 데이터 오류로 인정한다. {@link
     * org.springframework.orm.jpa.JpaSystemException}처럼 제약 타입이 아닌
     * {@link DataAccessException}은 원인이 값인지 단정할 수 없으므로 인프라 오류로
     * 보고하여 사용자가 재시도 대상으로 판단할 수 있게 한다. 문자열 메시지는 사용하지 않는다.
     */
    static String failureReason(DataAccessException ex) {
        return ex instanceof DataIntegrityViolationException
                ? "DB_CONSTRAINT" : "DB_INFRASTRUCTURE";
    }

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
    public record Classification(Kind kind, String effectiveCode) {
    }

    public enum Kind {
        REJECT_NAME_NULL, SKIPPED_PLACEHOLDER, NORMAL
    }

    /** Partner UPSERT 결과. */
    public record UpsertResult(java.util.UUID partnerId, boolean isNew, PartnerStatus status) {
    }
}
