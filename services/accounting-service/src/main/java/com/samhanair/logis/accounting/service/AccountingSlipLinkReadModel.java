package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.List;

/**
 * 원천 판매·입고전표와 기존 회계전표 allocation 연결을 사용자용 값으로 표현하는 조회 모델.
 *
 * <p>내부 조인에는 UUID를 사용하지만 이 계약에는 전표번호·상태·금액만 담아 UUID가 사용자에게
 * 노출되지 않는다.
 */
public record AccountingSlipLinkReadModel(
        String sourceSlipNo,
        String sourceSlipType,
        String sourceSlipStatus,
        String sourcePartnerCode,
        BigDecimal sourceAmount,
        BigDecimal allocatedAmount,
        BigDecimal allocatedQuantity,
        List<LinkedSlip> linkedSlips,
        boolean amountMatched) {

    public AccountingSlipLinkReadModel {
        linkedSlips = linkedSlips == null ? List.of() : List.copyOf(linkedSlips);
    }

    /** 테스트·내부 조립 편의를 위한 상태 기본값 포함 생성자. */
    public AccountingSlipLinkReadModel(String sourceSlipNo, String sourceSlipType,
                                       BigDecimal sourceAmount, BigDecimal allocatedAmount,
                                       BigDecimal allocatedQuantity, List<LinkedSlip> linkedSlips,
                                       boolean amountMatched) {
        this(sourceSlipNo, sourceSlipType, "CONFIRMED", "PARTNER", sourceAmount,
                allocatedAmount, allocatedQuantity, linkedSlips, amountMatched);
    }

    /** 연결된 회계전표의 사용자 노출용 요약. */
    public record LinkedSlip(String slipNo, String status, BigDecimal amount) {}
}
