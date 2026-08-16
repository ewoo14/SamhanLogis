package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.RoundingMode;
import java.util.UUID;

/** 일마감 S1 원본행. 레거시 17열과 확장 DC/확인 사유를 분리해 보존한다. */
public record DailyClosingRowResponse(
        String dcCondition,
        LocalDate slipDate,
        int seqNo,
        String warehouseName,
        String productName,
        String modelName,
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
        SlipStatus sourceStatus,
        UUID slipId,
        UUID lineId,
        LocalDateTime updatedAt,
        boolean amountEditable,
        String amountEditBlockReason) {

    /** S1 기존 호출자 호환 생성자 — S7 내부 편집 메타데이터는 읽기 전용 기본값으로 둔다. */
    public DailyClosingRowResponse(
            String dcCondition, LocalDate slipDate, int seqNo, String warehouseName,
            String productName, int quantity, BigDecimal unitPriceWithVat,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal total,
            String partnerName, String partnerCode, BigDecimal productPrice,
            BigDecimal discountRate, BigDecimal grandTotal, Confirmation confirmation,
            String confirmationReason, LocalDateTime accountingPostedAt,
            BigDecimal dcAmount, SlipStatus sourceStatus) {
        this(dcCondition, slipDate, seqNo, warehouseName, productName, null, quantity,
                unitPriceWithVat, supplyAmount, vatAmount, total, partnerName, partnerCode,
                productPrice, discountRate, grandTotal, confirmation, confirmationReason,
                accountingPostedAt, dcAmount, sourceStatus, null, null,
                null,
                accountingPostedAt == null, accountingPostedAt == null ? null : "회계전표가 이미 반영되었습니다.");
    }

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
                line.getModelName(),
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
                slip.getStatus(),
                slip.getId(),
                line.getId(),
                slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt(),
                source.accountingPostedAt() == null,
                source.accountingPostedAt() == null ? null : "회계전표가 이미 반영되었습니다.");
    }

    /** 마감일 잠금 결과를 조회 응답에 반영한다. */
    public DailyClosingRowResponse withAmountEditability(boolean editable, String reason) {
        return new DailyClosingRowResponse(dcCondition, slipDate, seqNo, warehouseName, productName, modelName,
                quantity, unitPriceWithVat, supplyAmount, vatAmount, total, partnerName, partnerCode,
                productPrice, discountRate, grandTotal, confirmation, confirmationReason,
                accountingPostedAt, dcAmount, sourceStatus, slipId, lineId, updatedAt,
                editable && amountEditable, editable && amountEditable ? null
                        : (editable ? amountEditBlockReason : reason));
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
