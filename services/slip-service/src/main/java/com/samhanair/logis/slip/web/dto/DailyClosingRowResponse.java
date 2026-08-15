package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.RoundingMode;

/** 일마감 S1 원본행. 레거시 17열과 확장 DC/확인 사유를 분리해 보존한다. */
public record DailyClosingRowResponse(
        String dcCondition,
        LocalDate slipDate,
        int seqNo,
        String warehouseName,
        String productName,
        int quantity,
        BigDecimal unitPriceWithVat,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal total,
        String partnerName,
        String partnerCode,
        BigDecimal productPrice,
        BigDecimal discountRate,
        BigDecimal grandTotal,
        Confirmation confirmation,
        String confirmationReason,
        LocalDateTime accountingPostedAt,
        BigDecimal dcAmount,
        SlipStatus sourceStatus) {

    public enum Confirmation { CONFIRMED, MISMATCH, UNDETERMINED }

    /** S2 타 서비스 원천 조회값. null은 해당 원천 미확보를 의미한다. */
    public record SourceValues(
            BigDecimal productPrice,
            String dcCondition,
            LocalDateTime accountingPostedAt,
            String sourceFailureReason) {
    }

    public static DailyClosingRowResponse from(Slip slip, SlipLine line) {
        return from(slip, line, new SourceValues(null, null, null,
                "출고가·DC조건·회계반영일자 원천 미확보"));
    }

    public static DailyClosingRowResponse from(Slip slip, SlipLine line, SourceValues source) {
        BigDecimal supply = zero(line.getSupplyAmount());
        BigDecimal vat = zero(line.getVatAmount());
        BigDecimal unitPriceWithVat = zero(line.getUnitPriceWithVat());
        BigDecimal grandTotal = unitPriceWithVat.multiply(BigDecimal.valueOf(line.getQuantity()));
        BigDecimal productPrice = source.productPrice();
        BigDecimal discountRate = null;
        BigDecimal dcAmount = null;
        Confirmation confirmation = Confirmation.UNDETERMINED;
        String confirmationReason = source.sourceFailureReason();
        if (productPrice != null && productPrice.signum() > 0) {
            discountRate = BigDecimal.ONE.subtract(unitPriceWithVat.divide(productPrice, 8, RoundingMode.HALF_UP))
                    .multiply(BigDecimal.valueOf(100))
                    .setScale(0, RoundingMode.HALF_UP);
            dcAmount = productPrice.subtract(unitPriceWithVat);
            confirmation = Confirmation.CONFIRMED;
            confirmationReason = null;
        }
        return new DailyClosingRowResponse(
                source.dcCondition(),
                slip.getSlipDate(),
                slip.getSeqNo(),
                null,
                line.getProductName(),
                line.getQuantity(),
                unitPriceWithVat,
                supply,
                vat,
                supply.add(vat),
                slip.getPartnerName(),
                slip.getPartnerCode(),
                productPrice,
                discountRate,
                grandTotal,
                confirmation,
                confirmationReason,
                source.accountingPostedAt(),
                dcAmount,
                slip.getStatus());
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
