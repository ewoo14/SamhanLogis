package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.List;

/**
 * 원천 판매·구매전표와 기존 회계전표 allocation 연결을 사용자용 값으로 표현하는 조회 모델.
 *
 * <p>내부 조인에는 UUID를 사용하지만 이 계약에는 전표번호·상태·금액만 담아 UUID가 사용자에게
 * 노출되지 않는다.
 */
public record AccountingSlipLinkReadModel(
        String sourceSlipNo,
        String sourceSlipType,
        String sourceSlipStatus,
        String sourcePartnerCode,
        BigDecimal sourceQuantity,
        BigDecimal sourceAmount,
        BigDecimal allocatedAmount,
        BigDecimal allocatedQuantity,
        List<LinkedSlip> linkedSlips,
        TaxInvoiceLinkStatus taxInvoiceLinkStatus,
        boolean legacyReadOnly,
        boolean dataIntegrityBlocked,
        boolean amountMatched) {

    public AccountingSlipLinkReadModel {
        sourceQuantity = sourceQuantity == null ? BigDecimal.ZERO : sourceQuantity;
        sourceAmount = sourceAmount == null ? BigDecimal.ZERO : sourceAmount;
        allocatedAmount = allocatedAmount == null ? BigDecimal.ZERO : allocatedAmount;
        allocatedQuantity = allocatedQuantity == null ? BigDecimal.ZERO : allocatedQuantity;
        linkedSlips = linkedSlips == null ? List.of() : List.copyOf(linkedSlips);
        taxInvoiceLinkStatus = taxInvoiceLinkStatus == null
                ? TaxInvoiceLinkStatus.UNKNOWN : taxInvoiceLinkStatus;
    }

    /** 테스트·내부 조립 편의를 위한 상태 기본값 포함 생성자. */
    public AccountingSlipLinkReadModel(String sourceSlipNo, String sourceSlipType,
                                       BigDecimal sourceAmount, BigDecimal allocatedAmount,
                                       BigDecimal allocatedQuantity, List<LinkedSlip> linkedSlips,
                                       boolean amountMatched) {
        this(sourceSlipNo, sourceSlipType, "CONFIRMED", "PARTNER", BigDecimal.ZERO,
                sourceAmount, allocatedAmount, allocatedQuantity, linkedSlips,
                TaxInvoiceLinkStatus.NOT_LINKED, false, false, amountMatched);
    }

    /** 기존 full 생성자 호환용. */
    public AccountingSlipLinkReadModel(String sourceSlipNo, String sourceSlipType,
                                       String sourceSlipStatus, String sourcePartnerCode,
                                       BigDecimal sourceAmount, BigDecimal allocatedAmount,
                                       BigDecimal allocatedQuantity, List<LinkedSlip> linkedSlips,
                                       boolean amountMatched) {
        this(sourceSlipNo, sourceSlipType, sourceSlipStatus, sourcePartnerCode, BigDecimal.ZERO,
                sourceAmount, allocatedAmount, allocatedQuantity, linkedSlips,
                TaxInvoiceLinkStatus.NOT_LINKED,
                "LEGACY_READ_ONLY".equals(sourceSlipStatus),
                sourcePartnerCode == null || sourcePartnerCode.isBlank(), amountMatched);
    }

    /** 원천 전표에서 아직 연결하지 않은 금액. */
    public BigDecimal remainingAmount() {
        return sourceAmount.subtract(allocatedAmount).max(BigDecimal.ZERO);
    }

    /** 원천 전표에서 아직 연결하지 않은 수량. */
    public BigDecimal remainingQuantity() {
        return sourceQuantity.subtract(allocatedQuantity).max(BigDecimal.ZERO);
    }

    /** 연결된 회계전표의 사용자 노출용 요약. */
    public record LinkedSlip(String slipNo, String status, BigDecimal amount,
                             TaxInvoiceLinkStatus taxInvoiceLinkStatus) {
        public LinkedSlip(String slipNo, String status, BigDecimal amount) {
            this(slipNo, status, amount, TaxInvoiceLinkStatus.UNKNOWN);
        }
    }

    /** 회계전표와 세금계산서의 연결 상태. */
    public enum TaxInvoiceLinkStatus {
        LINKED,
        NOT_LINKED,
        LEGACY_READ_ONLY,
        UNKNOWN
    }
}
