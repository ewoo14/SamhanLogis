package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.OutboundSlipLineSummary;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.web.dto.DpsCompareResponse;
import com.samhanair.logis.inventory.web.dto.RowMismatch;
import com.samhanair.logis.inventory.web.dto.RowMismatch.MismatchType;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * DPS 입고 비교 service — PR-E1 BE-2.
 *
 * <p>legacy GAS 1번 (DPS 입고기록 비교) + 16번 (품목별 DPS 입고내역 비교) 의 자동화 endpoint
 * 비즈니스 로직. 출고전표는 자체 자동 조회 (slip-service Feign), DPS 는 사용자 엑셀 업로드 유지.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@link SlipServiceClient#getOutboundSlips} — 기간 내 출고전표 라인 평탄화 응답</li>
 *   <li>{@link DpsExcelParser#parse} — 엑셀 row 추출</li>
 *   <li>{@link DpsCompareGroupBy} 에 따라 SLIP / ITEM 단위 매칭 + mismatch 누적</li>
 *   <li>{@link DpsCompareResponse} 반환</li>
 * </ol>
 */
@Service
public class DpsCompareService {

    /** 양식 다운로드 헤더 — DPS 엑셀 템플릿의 1행. {@link DpsExcelParser} 매칭 keyword 와 정렬. */
    static final String[] TEMPLATE_HEADERS = {
            DpsExcelParser.HEADER_PRODUCT_CODE,
            DpsExcelParser.HEADER_INBOUND_DATE,
            DpsExcelParser.HEADER_QUANTITY,
            DpsExcelParser.HEADER_PARTNER_CODE,
            "거래처명"
    };

    private final SlipServiceClient slipServiceClient;
    private final DpsExcelParser dpsExcelParser;

    public DpsCompareService(SlipServiceClient slipServiceClient,
                             DpsExcelParser dpsExcelParser) {
        this.slipServiceClient = slipServiceClient;
        this.dpsExcelParser = dpsExcelParser;
    }

    /**
     * DPS 입고 비교 실행 — multipart 업로드 + 출고전표 자동 조회 + 매칭 + mismatch 누적.
     *
     * @param file    DPS 엑셀 (.xlsx) MultipartFile (필수, non-empty)
     * @param from    출고전표 자동 조회 기간 시작
     * @param to      출고전표 자동 조회 기간 종료
     * @param groupBy 매칭 단위 (SLIP/ITEM)
     * @return 매칭 결과 + mismatch 라인 목록
     * @throws BusinessException(INVALID_INPUT) file null/empty, 인자 누락, 엑셀 형식 오류
     * @throws BusinessException(INTERNAL_ERROR) slip-service 호출 실패, 엑셀 stream IO 오류
     */
    public DpsCompareResponse compare(MultipartFile file, LocalDate from, LocalDate to,
                                      DpsCompareGroupBy groupBy) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "DPS 엑셀 파일이 비어있습니다");
        }
        if (groupBy == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "groupBy 는 필수입니다 (SLIP/ITEM)");
        }
        // from/to null/range 검증은 slipServiceClient 가 위임 (단일 진실 source)

        List<OutboundSlipLineSummary> outbound = slipServiceClient.getInboundSlips(from, to);
        List<DpsExcelRow> dpsRows;
        try (InputStream in = file.getInputStream()) {
            dpsRows = dpsExcelParser.parse(in);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "DPS 엑셀 stream 읽기 실패: " + ex.getMessage(), ex);
        }

        boolean actualDpsFormat = dpsRows.stream().anyMatch(row -> row.deliveryNo() != null);
        List<RowMismatch> mismatches = actualDpsFormat
                ? matchByInbound(outbound, dpsRows)
                : (groupBy == DpsCompareGroupBy.SLIP
                    ? matchBySlip(outbound, dpsRows)
                    : matchByItem(outbound, dpsRows));

        // matched = 출고전표 라인 중 mismatch 가 아닌 건수 (출고 기준 정상 매칭 카운트).
        // QUANTITY/PARTNER/DPS_NOT_FOUND 는 출고 기준 mismatch, SLIP_NOT_FOUND 는 출고에 없는 케이스.
        int outboundMismatched = (int) mismatches.stream()
                .filter(m -> m.rowType() != MismatchType.SLIP_NOT_FOUND)
                .count();
        int matched = outbound.size() - outboundMismatched;
        if (matched < 0) {
            matched = 0;
        }

        return new DpsCompareResponse(
                from, to, groupBy.name(),
                outbound.size(), dpsRows.size(),
                matched, mismatches.size(),
                mismatches);
    }

    /**
     * DPS 양식 (.xlsx) 바이너리 생성 — GET {@code /warehouse/audit/dps-compare/template}.
     *
     * @return 헤더 row 만 있는 빈 .xlsx 바이너리
     */
    public byte[] generateTemplate() {
        try (Workbook workbook = new XSSFWorkbook();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("DPS 입고");

            CellStyle headerStyle = workbook.createCellStyle();
            Font font = workbook.createFont();
            font.setBold(true);
            headerStyle.setFont(font);

            Row header = sheet.createRow(0);
            for (int i = 0; i < TEMPLATE_HEADERS.length; i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(TEMPLATE_HEADERS[i]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 4500);
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "DPS 양식 생성 실패: " + ex.getMessage(), ex);
        }
    }

    // ---------- SLIP 단위 매칭 (legacy GAS 1번) ----------

    /**
     * SLIP 단위 매칭 — 매칭 키 = (slipNo + productCode).
     *
     * <p>같은 슬립 + 같은 품번 라인이 양쪽에 존재하면:
     * <ul>
     *   <li>수량 일치 + 거래처 일치 → 정상 (mismatch 없음)</li>
     *   <li>수량 불일치 → {@link MismatchType#QUANTITY_MISMATCH}</li>
     *   <li>거래처 불일치 → {@link MismatchType#PARTNER_MISMATCH} (둘 다 non-null 이고 다를 때)</li>
     * </ul>
     *
     * <p>한 쪽만 존재 시:
     * <ul>
     *   <li>출고전표만 존재 → {@link MismatchType#DPS_NOT_FOUND}</li>
     *   <li>DPS 엑셀만 존재 → {@link MismatchType#SLIP_NOT_FOUND}</li>
     * </ul>
     *
     * <p>NOTE: DPS 엑셀에는 보통 slipNo 컬럼이 없으므로, SLIP 단위 매칭은 DPS row 의 productCode +
     * 거래처코드 + 입고일자 조합을 출고전표 (slipNo, slipDate, productCode, partnerCode) 와 매칭한다 —
     * "같은 거래처 + 같은 품번 + 같은 날짜" 가 1쌍이라는 legacy GAS 1번 가정.
     */
    List<RowMismatch> matchBySlip(List<OutboundSlipLineSummary> outbound, List<DpsExcelRow> dpsRows) {
        List<RowMismatch> mismatches = new ArrayList<>();

        // DPS row 를 (productCode + partnerCode + inboundDate) bucket 으로 그룹 (수량 합계)
        Map<String, DpsBucket> dpsBuckets = new HashMap<>();
        for (DpsExcelRow row : dpsRows) {
            String key = slipMatchKey(row.productCode(), row.partnerCode(), row.inboundDate());
            DpsBucket bucket = dpsBuckets.computeIfAbsent(key,
                    k -> new DpsBucket(row.productCode(), row.partnerCode(), row.inboundDate()));
            bucket.totalQty += row.quantity();
        }

        Set<String> matchedDpsKeys = new HashSet<>();

        // 출고전표 라인을 순회 — 매칭 시도
        for (OutboundSlipLineSummary slip : outbound) {
            String key = slipMatchKey(slip.productCode(), slip.partnerCode(), slip.slipDate());
            DpsBucket bucket = dpsBuckets.get(key);
            if (bucket == null) {
                // DPS 미발견 — productCode 동일하지만 거래처 다른 row 가 있는지 확인 (PARTNER_MISMATCH)
                DpsBucket partnerMismatchBucket = findPartnerMismatchBucket(dpsBuckets,
                        slip.productCode(), slip.slipDate(), slip.partnerCode());
                if (partnerMismatchBucket != null) {
                    String partnerKey = slipMatchKey(partnerMismatchBucket.productCode,
                            partnerMismatchBucket.partnerCode, partnerMismatchBucket.inboundDate);
                    matchedDpsKeys.add(partnerKey);
                    mismatches.add(new RowMismatch(MismatchType.PARTNER_MISMATCH,
                            slip.slipNo(), slip.productCode(), slip.partnerCode(),
                            slip.quantity(), partnerMismatchBucket.totalQty,
                            "거래처 불일치 — 출고: " + safe(slip.partnerCode())
                                    + " / DPS: " + safe(partnerMismatchBucket.partnerCode)));
                } else {
                    mismatches.add(new RowMismatch(MismatchType.DPS_NOT_FOUND,
                            slip.slipNo(), slip.productCode(), slip.partnerCode(),
                            slip.quantity(), 0,
                            "DPS 엑셀에서 매칭 row 미발견"));
                }
                continue;
            }

            matchedDpsKeys.add(key);
            if (slip.quantity() != bucket.totalQty) {
                mismatches.add(new RowMismatch(MismatchType.QUANTITY_MISMATCH,
                        slip.slipNo(), slip.productCode(), slip.partnerCode(),
                        slip.quantity(), bucket.totalQty,
                        "수량 불일치 — 출고: " + slip.quantity() + " / DPS: " + bucket.totalQty));
            }
        }

        // matched 안 된 DPS bucket → SLIP 미발견
        for (Map.Entry<String, DpsBucket> entry : dpsBuckets.entrySet()) {
            if (matchedDpsKeys.contains(entry.getKey())) {
                continue;
            }
            DpsBucket b = entry.getValue();
            mismatches.add(new RowMismatch(MismatchType.SLIP_NOT_FOUND,
                    null, b.productCode, b.partnerCode,
                    0, b.totalQty,
                    "출고전표에서 매칭 라인 미발견"));
        }

        return mismatches;
    }

    private DpsBucket findPartnerMismatchBucket(Map<String, DpsBucket> dpsBuckets,
                                                String productCode, LocalDate slipDate,
                                                String slipPartnerCode) {
        if (productCode == null) {
            return null;
        }
        for (DpsBucket b : dpsBuckets.values()) {
            if (Objects.equals(b.productCode, productCode)
                    && Objects.equals(b.inboundDate, slipDate)
                    && b.partnerCode != null
                    && slipPartnerCode != null
                    && !Objects.equals(b.partnerCode, slipPartnerCode)) {
                return b;
            }
        }
        return null;
    }

    private String slipMatchKey(String productCode, String partnerCode, LocalDate date) {
        return safe(productCode) + "|" + safe(partnerCode) + "|"
                + (date == null ? "" : date.toString());
    }

    // ---------- ITEM 단위 매칭 (legacy GAS 16번) ----------

    /**
     * ITEM 단위 매칭 — productCode 별 출고 합계 vs 입고 합계 비교.
     *
     * <p>거래처/슬립 식별자는 비교 안 함. 매칭 키 = productCode 단일.
     */
    List<RowMismatch> matchByItem(List<OutboundSlipLineSummary> outbound, List<DpsExcelRow> dpsRows) {
        List<RowMismatch> mismatches = new ArrayList<>();

        Map<String, Integer> outSum = new HashMap<>();
        for (OutboundSlipLineSummary s : outbound) {
            outSum.merge(safe(s.productCode()), s.quantity(), Integer::sum);
        }
        Map<String, Integer> dpsSum = new HashMap<>();
        for (DpsExcelRow r : dpsRows) {
            dpsSum.merge(safe(r.productCode()), r.quantity(), Integer::sum);
        }

        Set<String> allKeys = new HashSet<>();
        allKeys.addAll(outSum.keySet());
        allKeys.addAll(dpsSum.keySet());

        for (String code : allKeys) {
            int expected = outSum.getOrDefault(code, 0);
            int actual = dpsSum.getOrDefault(code, 0);
            if (expected == 0 && actual > 0) {
                mismatches.add(new RowMismatch(MismatchType.SLIP_NOT_FOUND,
                        null, code, null, 0, actual,
                        "출고 합계 0 / DPS 합계 " + actual));
            } else if (actual == 0 && expected > 0) {
                mismatches.add(new RowMismatch(MismatchType.DPS_NOT_FOUND,
                        null, code, null, expected, 0,
                        "출고 합계 " + expected + " / DPS 합계 0"));
            } else if (expected != actual) {
                mismatches.add(new RowMismatch(MismatchType.QUANTITY_MISMATCH,
                        null, code, null, expected, actual,
                        "수량 합계 불일치 — 출고: " + expected + " / DPS: " + actual));
            }
        }

        return mismatches;
    }

    /** 레거시 키(납품번호 적요 + 정규화 모델명)로 입고 라인을 행별 1:1 소비한다. */
    List<RowMismatch> matchByInbound(List<OutboundSlipLineSummary> inbound,
                                     List<DpsExcelRow> dpsRows) {
        List<RowMismatch> result = new ArrayList<>();
        boolean[] consumed = new boolean[dpsRows.size()];
        for (OutboundSlipLineSummary line : inbound) {
            int found = -1;
            String key = inboundKey(line.slipNo(), line.productCode());
            for (int i = 0; i < dpsRows.size(); i++) {
                if (!consumed[i] && key.equals(inboundKey(dpsRows.get(i).deliveryNo(),
                        dpsRows.get(i).productCode()))) {
                    found = i;
                    break;
                }
            }
            if (found < 0) {
                result.add(new RowMismatch(MismatchType.DPS_NOT_FOUND, line.slipNo(),
                        line.productCode(), line.partnerCode(), line.quantity(), 0,
                        line.totalAmount(), BigDecimal.ZERO, "DPS 엑셀에서 매칭 row 미발견"));
                continue;
            }
            consumed[found] = true;
            DpsExcelRow row = dpsRows.get(found);
            boolean qtyMismatch = line.quantity() != row.quantity();
            boolean amountMismatch = line.totalAmount().compareTo(row.totalAmount()) != 0;
            if (qtyMismatch) {
                result.add(new RowMismatch(MismatchType.QUANTITY_MISMATCH, line.slipNo(),
                        line.productCode(), line.partnerCode(), line.quantity(), row.quantity(),
                        line.totalAmount(), row.totalAmount(), "수량 불일치"));
            } else if (amountMismatch) {
                result.add(new RowMismatch(MismatchType.AMOUNT_MISMATCH, line.slipNo(),
                        line.productCode(), line.partnerCode(), line.quantity(), row.quantity(),
                        line.totalAmount(), row.totalAmount(), "합계금액 불일치"));
            }
        }
        for (int i = 0; i < dpsRows.size(); i++) {
            if (!consumed[i]) {
                DpsExcelRow row = dpsRows.get(i);
                result.add(new RowMismatch(MismatchType.SLIP_NOT_FOUND, row.deliveryNo(),
                        row.productCode(), row.partnerCode(), 0, row.quantity(), BigDecimal.ZERO,
                        row.totalAmount(), "입고전표에서 매칭 라인 미발견"));
            }
        }
        return result;
    }

    private String inboundKey(String deliveryNo, String productCode) {
        return safe(deliveryNo) + "|" + normalizeModel(productCode);
    }

    private String normalizeModel(String model) {
        return safe(model).replaceAll("\\s+", "").toUpperCase(java.util.Locale.ROOT);
    }

    private static String safe(String v) {
        return v == null ? "" : v;
    }

    /** SLIP 단위 매칭의 DPS row 그룹 (수량 합계). */
    private static final class DpsBucket {
        final String productCode;
        final String partnerCode;
        final LocalDate inboundDate;
        int totalQty;

        DpsBucket(String productCode, String partnerCode, LocalDate inboundDate) {
            this.productCode = productCode;
            this.partnerCode = partnerCode;
            this.inboundDate = inboundDate;
        }
    }
}
