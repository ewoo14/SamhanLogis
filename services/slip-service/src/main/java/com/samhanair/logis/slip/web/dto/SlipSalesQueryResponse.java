package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * accounting-service 세금계산서 일괄발행 배치용 판매조회 응답 DTO.
 *
 * <p>accounting-service {@code SlipQueryClient.fetchAllSalesRows()} 가 수신하는 Map 키와
 * 1:1 매핑된다. {@code HometaxExportService.toHomtaxRow()} 의 Map 접근 키:
 * <ul>
 *   <li>{@code partnerCode}     — 거래처코드 (UUID 비공개 가드 — businessNumber 별도 제공)</li>
 *   <li>{@code partnerName}     — 거래처명 snapshot</li>
 *   <li>{@code slipNo}          — 전표번호 (사용자 노출 식별자)</li>
 *   <li>{@code slipDate}        — 전표 날짜 (ISO yyyy-MM-dd)</li>
 *   <li>{@code accountingDate}  — 회계 반영일 (confirmedAt 날짜 — null 허용)</li>
 *   <li>{@code supplyAmount}    — 공급가액 합산 (SlipLine.supplyAmount 합, null 시 lineTotal 합 사용)</li>
 *   <li>{@code vatAmount}       — 부가세 합산 (SlipLine.vatAmount 합)</li>
 *   <li>{@code deliveryAddress} — 배송주소</li>
 *   <li>{@code itemName}        — 대표 품목명 (첫 번째 라인)</li>
 * </ul>
 *
 * <p>partner-service 스냅샷 필드 ({@code representativeName} / {@code address} /
 * {@code bizType} / {@code bizItem} / {@code email}) 는 Slip 엔티티에 보관되지 않으므로
 * 빈 문자열로 반환 — {@code HometaxExportService.safeStr()} 에서 fallback 처리됨.
 *
 * <p>UUID 비공개 가드: {@code slipId} 는 포함하지 않음.
 * accounting-service 는 {@code slipNo} 를 행 식별자로 사용.
 */
public record SlipSalesQueryResponse(
        /** 거래처코드 (UUID 비공개 가드 — businessNumber 별도 제공). */
        String partnerCode,
        /** 거래처명 snapshot. */
        String partnerName,
        /** 사업자등록번호 snapshot (홈택스 buyerRegNo 원본). */
        String businessNumber,
        /** 전표번호 (사용자 노출 식별자). */
        String slipNo,
        /** 전표 날짜. */
        LocalDate slipDate,
        /**
         * 회계 반영일 — {@code confirmedAt} 날짜 기준.
         * null 이면 HometaxExportService 의 excludeUnconfirmed 필터 대상.
         */
        LocalDate accountingDate,
        /** 공급가액 합산 (SlipLine.supplyAmount 합; null 라인은 lineTotal 로 대체). */
        BigDecimal supplyAmount,
        /** 부가세 합산 (SlipLine.vatAmount 합). */
        BigDecimal vatAmount,
        /** 배송주소 (deliveryAddress 컬럼 — null 이면 빈 문자열). */
        String deliveryAddress,
        /** 대표 품목명 — 첫 번째 SlipLine.productName (없으면 빈 문자열). */
        String itemName,
        /** 대표자명 snapshot (Slip 엔티티 customerRepresentative — null 허용). */
        String representativeName,
        /** 거래처 주소 snapshot (Slip 엔티티 customerAddress — null 허용). */
        String address,
        /** 업태 (Slip 엔티티 미보유 — 빈 문자열 반환). */
        String bizType,
        /** 종목 (Slip 엔티티 미보유 — 빈 문자열 반환). */
        String bizItem,
        /** 이메일 (Slip 엔티티 미보유 — 빈 문자열 반환). */
        String email) {

    /**
     * Slip 엔티티로부터 판매조회 응답 record 를 빌드한다.
     *
     * <p>공급가액 합산 정책:
     * <ol>
     *   <li>SlipLine.supplyAmount 가 non-null 인 라인만 합산</li>
     *   <li>supplyAmount 합산이 0 이면 SlipLine.lineTotal 합산으로 대체 (legacy 라인 호환)</li>
     * </ol>
     *
     * <p>accountingDate 는 {@code confirmedAt} 날짜 기준. CONFIRMED 슬립이 항상 non-null 이지만
     * legacy 라인 방어 코드로 null 허용.
     *
     * @param slip 전표 엔티티 (CONFIRMED + OUTBOUND 보장 — repository 쿼리에서 필터됨)
     * @return 판매조회 응답 record
     */
    public static SlipSalesQueryResponse from(Slip slip) {
        BigDecimal supplyTotal = BigDecimal.ZERO;
        BigDecimal vatTotal = BigDecimal.ZERO;
        BigDecimal lineTotalFallback = BigDecimal.ZERO;
        String firstItemName = "";

        for (SlipLine line : slip.getLines()) {
            if (line.getSupplyAmount() != null) {
                supplyTotal = supplyTotal.add(line.getSupplyAmount());
            }
            if (line.getVatAmount() != null) {
                vatTotal = vatTotal.add(line.getVatAmount());
            }
            if (line.getLineTotal() != null) {
                lineTotalFallback = lineTotalFallback.add(line.getLineTotal());
            }
            if (firstItemName.isEmpty() && line.getProductName() != null) {
                firstItemName = line.getProductName();
            }
        }

        // supplyAmount 누락 legacy 라인 대비 fallback
        if (BigDecimal.ZERO.compareTo(supplyTotal) == 0 && BigDecimal.ZERO.compareTo(lineTotalFallback) != 0) {
            supplyTotal = lineTotalFallback;
        }

        LocalDate accountingDate = null;
        LocalDateTime confirmedAt = slip.getConfirmedAt();
        if (confirmedAt != null) {
            accountingDate = confirmedAt.toLocalDate();
        }

        return new SlipSalesQueryResponse(
                nvl(slip.getPartnerCode()),
                nvl(slip.getPartnerName()),
                nvl(slip.getBusinessNumber()),
                slip.getSlipNo(),
                slip.getSlipDate(),
                accountingDate,
                supplyTotal,
                vatTotal,
                nvl(slip.getDeliveryAddress()),
                firstItemName,
                nvl(slip.getCustomerRepresentative()),
                nvl(slip.getCustomerAddress()),
                "", // bizType — Slip 미보유
                "", // bizItem — Slip 미보유
                ""  // email  — Slip 미보유
        );
    }

    private static String nvl(String v) {
        return v == null ? "" : v;
    }
}
