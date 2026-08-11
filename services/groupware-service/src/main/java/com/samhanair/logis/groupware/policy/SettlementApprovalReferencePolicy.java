package com.samhanair.logis.groupware.policy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/**
 * 정산 결재 참조를 groupware transaction 안에서 처리할 때의 시간·건수 예산.
 *
 * <p>accounting claim 의 ACTIVE lease는 300초이고, claim client 한 번의 최악 시간은
 * connect 2초 + read 5초다. 참조 하나마다 reserve/activate 두 번의 원격 왕복이 있으므로
 * 7건은 최악 98초(7 × 2 × 7초)이며, 120초 transaction 안에 DB·결재선 처리 여유 22초를 남긴다.
 * 7건을 넘는 요청은 transaction을 나누어야 하며, 상세 화면의 단건 추가 경로는 그대로 사용할 수 있다.
 */
public final class SettlementApprovalReferencePolicy {

    /** accounting ACTIVE claim lease. */
    public static final int ACTIVE_CLAIM_LEASE_SECONDS = 300;

    /** 원자 생성·상세 참조 추가가 공유하는 groupware transaction timeout. */
    public static final int TRANSACTION_TIMEOUT_SECONDS = 120;

    /** 원자 결재 생성 요청에서 허용하는 전체 참조 수. */
    public static final int MAX_ATOMIC_REFERENCES = 7;

    /** accounting claim client connect timeout. */
    public static final int CLAIM_CONNECT_TIMEOUT_SECONDS = 2;

    /** accounting claim client read timeout. */
    public static final int CLAIM_READ_TIMEOUT_SECONDS = 5;

    /** accounting claim client 한 번의 connect + read 최악 시간. */
    public static final int MAX_CLAIM_CALL_SECONDS =
            CLAIM_CONNECT_TIMEOUT_SECONDS + CLAIM_READ_TIMEOUT_SECONDS;

    private SettlementApprovalReferencePolicy() {
    }

    /** 요청 초과를 원격 호출 전에 읽을 수 있는 400 오류로 거부한다. */
    public static void validateAtomicReferenceCount(int referenceCount) {
        if (referenceCount > MAX_ATOMIC_REFERENCES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재 생성 시 참조는 최대 " + MAX_ATOMIC_REFERENCES
                            + "건까지 가능합니다. 초과분은 결재 생성 후 상세 화면에서 나누어 추가해 주세요");
        }
    }

    /** 현재 원자 생성 transaction의 monotonic deadline을 계산한다. */
    public static long deadlineNanos() {
        return System.nanoTime() + TRANSACTION_TIMEOUT_SECONDS * 1_000_000_000L;
    }

    /** 로컬 DB 작업 직전에 deadline을 확인한다. */
    public static void ensureWithinDeadline(long deadlineNanos) {
        if (System.nanoTime() >= deadlineNanos) {
            throw timedOut();
        }
    }

    /** remote claim 왕복을 시작할 충분한 시간이 남았는지 확인한다. */
    public static void ensureClaimCallFits(long deadlineNanos) {
        long callBudgetNanos = MAX_CLAIM_CALL_SECONDS * 1_000_000_000L;
        if (System.nanoTime() + callBudgetNanos >= deadlineNanos) {
            throw timedOut();
        }
    }

    private static BusinessException timedOut() {
        return new BusinessException(ErrorCode.INTERNAL_ERROR,
                "정산 참조가 많거나 회계 서비스 응답이 지연되어 결재 생성 시간이 제한을 초과했습니다. "
                        + "참조를 나누어 다시 시도해 주세요");
    }
}
