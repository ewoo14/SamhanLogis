package com.samhanair.logis.dcconfig.service;

import com.opencsv.CSVReader;
import com.opencsv.CSVReaderBuilder;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import com.samhanair.logis.dcconfig.dto.DcConfigImportResult;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.input.BOMInputStream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * DC 거래처 할인 정보 CSV import 서비스 (PR-D Part 2-2).
 *
 * <p>Samhan Public Notion 에서 다운받은 "거래처 DC정보" CSV 를 native 보존하기 위해
 * dc_configs 테이블에 upsert 하는 일괄 처리. partner_code 가 CSV 에 직접 포함되어 있어
 * dc-config-service 자체 partners 테이블을 우선 매칭하고, 로컬/신규 환경에 마스터가 없으면
 * CSV 의 거래처코드+업체명으로 최소 거래처 row 를 자동 생성한다.
 *
 * <h3>CSV 컬럼 ↔ DB 매핑</h3>
 * <pre>
 *   거래처코드     → partner_code (lookup key)
 *   업체명         → (검증/로그용)
 *   홈멀티DC       → home_discount_rate          ("46%"   → BigDecimal(0.46), 소수점 4자리)
 *   상업멀티DC     → commercial_discount_rate    ("47%"   → BigDecimal(0.47))
 *   유연호스I형    → show_i_hose                 ("Yes"/"No" → boolean)
 *   360            → discount_360_amount         ("₩20,000" → 20000.00)
 *   4way           → discount_4way_amount
 *   1way           → discount_1way_amount
 *   스탠드         → discount_stand_amount
 *   디럭스         → discount_deluxe_amount
 *   1등급          → discount_first_grade_amount
 *   단위처리       → unit_processing_enabled + unit_round_to + unit_round_mode
 *                    (#29 fidelity: 레거시 Notion select 9종 "10/100/1000원 올림·반올림·내림"
 *                     → enabled=true + roundTo + CEIL/ROUND/FLOOR. "Yes"/"No" 구형 포맷 호환 유지)
 *   특이사항       → note
 * </pre>
 *
 * <h3>거부 정책</h3>
 * <ul>
 *   <li>partner_code 부재 (CSV 빈 셀) → reject</li>
 *   <li>업체명 부재 → reject</li>
 *   <li>형식 변환 실패 (예: "abc%") → reject</li>
 * </ul>
 *
 * <h3>BOM / 인코딩</h3>
 * UTF-8 BOM 을 {@link BOMInputStream} 으로 strip 후 OpenCSV 로 파싱.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DcConfigImportService {

    // CSV 헤더 상수 (Notion 시트 컬럼명과 일치)
    private static final String COL_PARTNER_CODE = "거래처코드";
    private static final String COL_BUSINESS_NAME = "업체명";
    private static final String COL_HOME_DC = "홈멀티DC";
    private static final String COL_COMMERCIAL_DC = "상업멀티DC";
    private static final String COL_I_HOSE = "유연호스I형";
    private static final String COL_360 = "360";
    private static final String COL_4WAY = "4way";
    private static final String COL_1WAY = "1way";
    private static final String COL_STAND = "스탠드";
    private static final String COL_DELUXE = "디럭스";
    private static final String COL_FIRST_GRADE = "1등급";
    private static final String COL_UNIT_PROC = "단위처리";
    private static final String COL_NOTE = "특이사항";

    private final PartnerRepository partnerRepository;
    private final DcConfigRepository dcConfigRepository;

    /**
     * Notion CSV InputStream 을 받아 dc_configs upsert + 거부 row 보고.
     *
     * @param inputStream CSV 본문 (UTF-8, BOM 허용)
     * @return inserted/updated/skipped/rejected 결과
     */
    @Transactional
    public DcConfigImportResult importCsv(InputStream inputStream) {
        if (inputStream == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어있습니다");
        }

        int inserted = 0;
        int updated = 0;
        int skipped = 0;
        List<DcConfigImportResult.RejectedRow> rejected = new ArrayList<>();

        // BOM strip → UTF-8 reader → OpenCSV
        try (BOMInputStream bomStripped = BOMInputStream.builder()
                        .setInputStream(inputStream)
                        .setInclude(false)
                        .get();
                Reader reader = new BufferedReader(
                        new InputStreamReader(bomStripped, StandardCharsets.UTF_8));
                CSVReader csv = new CSVReaderBuilder(reader).build()) {

            String[] header = csv.readNext();
            if (header == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 헤더가 비어있습니다");
            }
            Map<String, Integer> col = headerIndex(header);
            requireColumn(col, COL_PARTNER_CODE);
            requireColumn(col, COL_BUSINESS_NAME);

            String[] row;
            int rowNo = 0;
            while ((row = csv.readNext()) != null) {
                rowNo++;
                if (isBlankRow(row)) {
                    skipped++;
                    continue;
                }

                String partnerCode = normalize(get(row, col, COL_PARTNER_CODE));
                String businessName = normalize(get(row, col, COL_BUSINESS_NAME));

                if (partnerCode == null && businessName == null) {
                    skipped++;
                    continue;
                }
                if (partnerCode == null) {
                    rejected.add(new DcConfigImportResult.RejectedRow(
                            rowNo, partnerCode, businessName, "거래처코드 부재"));
                    continue;
                }
                if (businessName == null) {
                    rejected.add(new DcConfigImportResult.RejectedRow(
                            rowNo, partnerCode, businessName, "업체명 부재"));
                    continue;
                }

                try {
                    Partner partner = partnerRepository.findByPartnerCode(partnerCode)
                            .orElseGet(() -> partnerRepository.save(Partner.create(
                                    partnerCode, partnerCode, businessName,
                                    null, null, null, null, null, "NOTION_DC_IMPORT")));
                    BigDecimal homeRate = parsePercent(get(row, col, COL_HOME_DC));
                    BigDecimal commRate = parsePercent(get(row, col, COL_COMMERCIAL_DC));
                    boolean iHose = parseYesNo(get(row, col, COL_I_HOSE));
                    BigDecimal d360 = parseCurrency(get(row, col, COL_360));
                    BigDecimal d4way = parseCurrency(get(row, col, COL_4WAY));
                    BigDecimal d1way = parseCurrency(get(row, col, COL_1WAY));
                    BigDecimal stand = parseCurrency(get(row, col, COL_STAND));
                    BigDecimal deluxe = parseCurrency(get(row, col, COL_DELUXE));
                    BigDecimal firstGr = parseCurrency(get(row, col, COL_FIRST_GRADE));
                    UnitProcessing unitProc = parseUnitProcessing(get(row, col, COL_UNIT_PROC));
                    String note = normalize(get(row, col, COL_NOTE));

                    Optional<DcConfig> existing = dcConfigRepository.findByPartner_Id(partner.getId());
                    DcConfig cfg = existing.orElseGet(() ->
                            DcConfig.create(partner, DcConfigSource.LEGACY_CSV));

                    cfg.changeRates(homeRate, commRate);
                    cfg.changeShowIHose(iHose);
                    cfg.changeOptionAmounts(d360, d4way, d1way, stand, deluxe, firstGr);
                    cfg.changeUnitProcessingEnabled(unitProc.enabled());
                    if (unitProc.roundTo() != null) {
                        cfg.changeRounding(unitProc.roundTo(), unitProc.roundMode());
                    }
                    cfg.changeNote(note);
                    cfg.changeSource(DcConfigSource.LEGACY_CSV);

                    if (existing.isPresent()) {
                        updated++;
                    } else {
                        dcConfigRepository.save(cfg);
                        inserted++;
                    }
                } catch (IllegalArgumentException ex) {
                    rejected.add(new DcConfigImportResult.RejectedRow(
                            rowNo, partnerCode, businessName,
                            "형식 변환 실패: " + ex.getMessage()));
                }
            }
        } catch (IOException | CsvValidationException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "CSV 파싱 실패: " + ex.getMessage());
        }

        log.info("DC config CSV import 결과 — inserted={}, updated={}, skipped={}, rejected={}",
                inserted, updated, skipped, rejected.size());
        return new DcConfigImportResult(inserted, updated, skipped, rejected);
    }

    // ---------------- helpers ----------------

    private static Map<String, Integer> headerIndex(String[] header) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < header.length; i++) {
            String h = header[i] == null ? "" : header[i].trim();
            map.put(h, i);
        }
        return map;
    }

    private static void requireColumn(Map<String, Integer> col, String name) {
        if (!col.containsKey(name)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "필수 CSV 컬럼 누락: " + name);
        }
    }

    private static String get(String[] row, Map<String, Integer> col, String name) {
        Integer idx = col.get(name);
        if (idx == null || idx >= row.length) {
            return null;
        }
        return row[idx];
    }

    private static boolean isBlankRow(String[] row) {
        for (String c : row) {
            if (c != null && !c.trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /** 빈 문자열 → null, 그 외 trim. */
    private static String normalize(String v) {
        if (v == null) {
            return null;
        }
        String t = v.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * "46%" → BigDecimal(0.4600), "0.46" → BigDecimal(0.4600), null/빈 문자열 → null.
     * 소수점 4자리 (NUMERIC(5,4)).
     */
    static BigDecimal parsePercent(String raw) {
        String v = normalize(raw);
        if (v == null) {
            return null;
        }
        boolean percentSuffix = v.endsWith("%");
        String trimmed = percentSuffix ? v.substring(0, v.length() - 1).trim() : v;
        try {
            BigDecimal value = new BigDecimal(trimmed);
            // 원천 CSV는 45%와 0.45 두 표현을 모두 사용한다. suffix가 없는 값은
            // 이미 0..1 fraction으로 보존하고, suffix가 있을 때만 percentage를 환산한다.
            BigDecimal fraction = (percentSuffix
                            ? value.divide(new BigDecimal("100"), 4, RoundingMode.HALF_UP)
                            : value)
                    .setScale(4, RoundingMode.HALF_UP);
            if (fraction.signum() < 0 || fraction.compareTo(BigDecimal.ONE) > 0) {
                throw new IllegalArgumentException("퍼센트 범위 초과 [" + raw + "]");
            }
            return fraction;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("퍼센트 파싱 실패 [" + raw + "]");
        }
    }

    /**
     * "₩20,000" → BigDecimal(20000.00), null/빈 문자열 → null. 소수점 2자리 (NUMERIC(12,2)).
     */
    static BigDecimal parseCurrency(String raw) {
        String v = normalize(raw);
        if (v == null) {
            return null;
        }
        // ₩, ',', 공백, 기타 통화 기호 제거
        String digits = v.replaceAll("[₩,\\s원]", "");
        if (digits.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(digits).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("금액 파싱 실패 [" + raw + "]");
        }
    }

    /**
     * "Yes" → true, "No"/null/빈 → false. 대소문자 무시.
     */
    static boolean parseYesNo(String raw) {
        String v = normalize(raw);
        if (v == null) {
            return false;
        }
        return v.equalsIgnoreCase("Yes") || v.equalsIgnoreCase("Y") || v.equalsIgnoreCase("True");
    }

    /** 단위처리 파싱 결과 — enabled + (select 포맷일 때만) roundTo/roundMode. */
    record UnitProcessing(boolean enabled, Integer roundTo, UnitRoundMode roundMode) {
    }

    private static final java.util.regex.Pattern UNIT_PROC_PATTERN =
            java.util.regex.Pattern.compile("^(10|100|1000)\\s*원?\\s*(올림|반올림|내림)$");

    /**
     * 단위처리 파싱 — #29 fidelity.
     *
     * <p>레거시 Notion select 9종("10원 올림" ~ "1000원 내림") → enabled=true +
     * roundTo(10/100/1000) + roundMode(올림=CEIL/반올림=ROUND/내림=FLOOR).
     * 구형 "Yes"/"No" 포맷은 enabled 만 갱신(rounding 유지). 그 외 비인식 값은
     * 거부(IllegalArgumentException) — silent 유실 금지.
     */
    static UnitProcessing parseUnitProcessing(String raw) {
        String v = normalize(raw);
        if (v == null) {
            return new UnitProcessing(false, null, null);
        }
        if (v.equalsIgnoreCase("Yes") || v.equalsIgnoreCase("Y") || v.equalsIgnoreCase("True")) {
            return new UnitProcessing(true, null, null);
        }
        if (v.equalsIgnoreCase("No") || v.equalsIgnoreCase("N") || v.equalsIgnoreCase("False")) {
            return new UnitProcessing(false, null, null);
        }
        java.util.regex.Matcher m = UNIT_PROC_PATTERN.matcher(v.replaceAll("\\s+", " ").trim());
        if (m.matches()) {
            int roundTo = Integer.parseInt(m.group(1));
            UnitRoundMode mode = switch (m.group(2)) {
                case "올림" -> UnitRoundMode.CEIL;
                case "내림" -> UnitRoundMode.FLOOR;
                default -> UnitRoundMode.ROUND;
            };
            return new UnitProcessing(true, roundTo, mode);
        }
        throw new IllegalArgumentException("단위처리 파싱 실패 [" + raw + "]");
    }
}
