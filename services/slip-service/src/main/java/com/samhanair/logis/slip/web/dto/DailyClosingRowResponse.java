package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

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

    public static DailyClosingRowResponse from(Slip slip, SlipLine line) {
        BigDecimal supply = zero(line.getSupplyAmount());
        BigDecimal vat = zero(line.getVatAmount());
        return new DailyClosingRowResponse(
                null,
                slip.getSlipDate(),
                slip.getSeqNo(),
                null,
                line.getProductName(),
                line.getQuantity(),
                zero(line.getUnitPriceWithVat()),
                supply,
                vat,
                supply.add(vat),
                slip.getPartnerName(),
                slip.getPartnerCode(),
                null,
                null,
                null,
                Confirmation.UNDETERMINED,
                "출고가·DC조건 원천이 S1 범위에서 미확보",
                null,
                null,
                slip.getStatus());
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
