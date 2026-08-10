package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** accounting-service 홈택스 배치용 CONFIRMED 판매조회 응답. */
public record SlipSalesQueryResponse(
        String partnerCode,
        String partnerName,
        String businessNumber,
        String slipNo,
        LocalDate slipDate,
        LocalDate accountingDate,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        String deliveryAddress,
        String itemName,
        String representativeName,
        String address,
        String bizType,
        String bizItem,
        String email,
        String itemSpec,
        BigDecimal itemQty,
        BigDecimal itemPrice,
        String itemRemark) {

    /** 기존 호출자 호환: 거래처 이메일 없이 전표만 변환한다. */
    public static SlipSalesQueryResponse from(Slip slip) {
        return from(slip, "");
    }

    /** 거래처 대표 이메일과 첫 라인 사용자 입력값을 함께 보존한다. */
    public static SlipSalesQueryResponse from(Slip slip, String partnerEmail) {
        BigDecimal supplyTotal = BigDecimal.ZERO;
        BigDecimal vatTotal = BigDecimal.ZERO;
        BigDecimal lineTotalFallback = BigDecimal.ZERO;
        String firstItemName = "";
        String firstItemSpec = "";
        BigDecimal firstItemQty = null;
        BigDecimal firstItemPrice = null;
        String firstItemRemark = "";

        for (SlipLine line : slip.getLines()) {
            if (line.getSupplyAmount() != null) supplyTotal = supplyTotal.add(line.getSupplyAmount());
            if (line.getVatAmount() != null) vatTotal = vatTotal.add(line.getVatAmount());
            if (line.getLineTotal() != null) lineTotalFallback = lineTotalFallback.add(line.getLineTotal());
            if (firstItemName.isEmpty() && line.getProductName() != null) {
                firstItemName = line.getProductName();
                firstItemSpec = line.getSpecification() != null && !line.getSpecification().isBlank()
                        ? line.getSpecification() : nvl(line.getModelName());
                firstItemQty = BigDecimal.valueOf(line.getQuantity());
                firstItemPrice = line.getUnitPrice();
                firstItemRemark = nvl(line.getNote());
            }
        }
        if (BigDecimal.ZERO.compareTo(supplyTotal) == 0
                && BigDecimal.ZERO.compareTo(lineTotalFallback) != 0) {
            supplyTotal = lineTotalFallback;
        }
        LocalDate accountingDate = null;
        LocalDateTime confirmedAt = slip.getConfirmedAt();
        if (confirmedAt != null) accountingDate = confirmedAt.toLocalDate();

        return new SlipSalesQueryResponse(
                nvl(slip.getPartnerCode()), nvl(slip.getPartnerName()), nvl(slip.getBusinessNumber()),
                slip.getSlipNo(), slip.getSlipDate(), accountingDate, supplyTotal, vatTotal,
                nvl(slip.getDeliveryAddress()), firstItemName,
                nvl(slip.getCustomerRepresentative()), nvl(slip.getCustomerAddress()), "", "",
                nvl(partnerEmail), firstItemSpec, firstItemQty, firstItemPrice, firstItemRemark);
    }

    private static String nvl(String value) {
        return value == null ? "" : value;
    }
}
