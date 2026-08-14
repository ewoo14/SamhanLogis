package com.samhanair.logis.accounting.service;

import java.util.ArrayList;
import java.util.List;
import java.math.BigDecimal;

/**
 * 회계전표 생성·전기·삭제 경로가 공유하는 서버 측 eligibility 판정 결과.
 *
 * <p>이번 슬라이스에서는 생성 판정만 제공하며 실제 생성 orchestration은 다음 슬라이스의 책임이다.
 */
public record AccountingSlipEligibility(boolean allowed, List<Reason> reasons,
                                        List<String> reasonMessages) {

    /** 판정을 통과하지 못한 업무 사유. */
    public enum Reason {
        DAILY_AMOUNT_UNVERIFIED("일마감 금액 검증이 완료되지 않았습니다"),
        AMOUNT_MISMATCH("원천 전표 금액과 연결 금액이 일치하지 않습니다"),
        ALREADY_ALLOCATED("원천 전표가 이미 회계전표에 연결되어 있습니다"),
        PERMISSION_DENIED("회계전표 생성 권한이 없습니다"),
        SOURCE_NOT_CONFIRMED("원천 전표가 확정 상태가 아닙니다"),
        SOURCE_PARTNER_MISSING("원천 전표 거래처 코드가 없습니다"),
        LEGACY_READ_ONLY("legacy 미연결 자료는 읽기 전용입니다"),
        SOURCE_DATA_INTEGRITY_BLOCKED("원천 전표 데이터 무결성 문제로 연결할 수 없습니다");

        private final String message;

        Reason(String message) {
            this.message = message;
        }

        public String message() {
            return message;
        }
    }

    /**
     * 원천 전표·일마감 검증·호출자 역할을 함께 평가한다.
     *
     * @param readModel 공통 연결 read model
     * @param dailyAmountVerified 일마감 금액 검증 완료 여부
     * @param actorRole 서버가 인증한 역할 코드
     * @return 허용 여부와 모든 차단 사유
     */
    public static AccountingSlipEligibility evaluate(AccountingSlipLinkReadModel readModel,
                                                       boolean dailyAmountVerified,
                                                       String actorRole) {
        List<Reason> reasons = new ArrayList<>();
        if (!dailyAmountVerified) {
            reasons.add(Reason.DAILY_AMOUNT_UNVERIFIED);
        }
        if (readModel == null) {
            reasons.add(Reason.AMOUNT_MISMATCH);
        } else if (!readModel.linkedSlips().isEmpty()) {
            if (!readModel.amountMatched()) {
                reasons.add(Reason.AMOUNT_MISMATCH);
            }
            reasons.add(Reason.ALREADY_ALLOCATED);
        }
        if (readModel != null && "LEGACY_READ_ONLY".equals(readModel.sourceSlipStatus())) {
            reasons.add(Reason.LEGACY_READ_ONLY);
        }
        if (readModel != null && readModel.legacyReadOnly()
                && !reasons.contains(Reason.LEGACY_READ_ONLY)) {
            reasons.add(Reason.LEGACY_READ_ONLY);
        }
        if (readModel != null && !"CONFIRMED".equals(readModel.sourceSlipStatus())) {
            reasons.add(Reason.SOURCE_NOT_CONFIRMED);
        }
        if (readModel != null && (readModel.sourcePartnerCode() == null
                || readModel.sourcePartnerCode().isBlank())) {
            reasons.add(Reason.SOURCE_PARTNER_MISSING);
            if (!reasons.contains(Reason.SOURCE_DATA_INTEGRITY_BLOCKED)) {
                reasons.add(Reason.SOURCE_DATA_INTEGRITY_BLOCKED);
            }
        } else if (readModel != null && readModel.dataIntegrityBlocked()) {
            reasons.add(Reason.SOURCE_DATA_INTEGRITY_BLOCKED);
        }
        if (!isAllowedRole(actorRole)) {
            reasons.add(Reason.PERMISSION_DENIED);
        }
        List<String> messages = reasons.stream().map(Reason::message).toList();
        return new AccountingSlipEligibility(reasons.isEmpty(), List.copyOf(reasons), messages);
    }

    /** Q5 일마감 게이트의 공통 판정. 금액이 없으면 검증할 원천이 없어 허용한다. */
    public static AccountingSlipEligibility evaluateDailyClosing(BigDecimal totalAmount,
                                                                  boolean amountVerified,
                                                                  String actorRole) {
        List<Reason> reasons = new ArrayList<>();
        if (totalAmount != null && totalAmount.signum() > 0 && !amountVerified) {
            reasons.add(Reason.DAILY_AMOUNT_UNVERIFIED);
        }
        return new AccountingSlipEligibility(reasons.isEmpty(), List.copyOf(reasons),
                reasons.stream().map(Reason::message).toList());
    }

    private static boolean isAllowedRole(String actorRole) {
        return "ACCOUNTANT".equals(actorRole)
                || "MANAGER".equals(actorRole)
                || "MASTER".equals(actorRole);
    }
}
