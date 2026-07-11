package com.samhanair.logis.shared.realtime.lock;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/**
 * 잠금 정책 위반 예외 — PR-H4a (Phase 12 Step 4a).
 *
 * <p>{@link EditLockGuard} 가 status set 정책 (LOCKED_REQUIRES_APPROVAL / FULLY_LOCKED) 위반 시
 * 던진다. {@link BusinessException} 상속 — global exception handler 가 HTTP 409 CONFLICT 로 매핑.
 *
 * <p>14 service 가 동일 예외 type 으로 throw → FE 가 일관 분기 (잠금 정책 message 표시).
 */
public class LockedException extends BusinessException {

    /**
     * 잠금 위반 예외 — message 는 한국어 권장 ("현 단계 (완료) 는 ...").
     *
     * @param message 사용자 노출 가능한 message
     */
    public LockedException(String message) {
        super(ErrorCode.CONFLICT, message);
    }
}
