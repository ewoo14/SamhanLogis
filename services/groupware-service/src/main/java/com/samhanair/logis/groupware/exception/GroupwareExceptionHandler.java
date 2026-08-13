package com.samhanair.logis.groupware.exception;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.TransactionTimedOutException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/**
 * groupware-service 도메인 예외 → {@link ApiResponse} 봉투 매핑.
 * partner-service / slip-service 의 동일 패턴.
 */
@RestControllerAdvice
public class GroupwareExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GroupwareExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        return ResponseEntity.status(code.getHttpStatus())
                .body(ApiResponse.fail(code, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .orElse("입력값이 유효하지 않습니다");
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, msg));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /**
     * JSON 본문 파싱 / enum 역직렬화 실패 → 400 INVALID_INPUT.
     *
     * @param ex 요청 본문 읽기 실패 예외
     * @return 400 INVALID_INPUT ApiResponse
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 본문이 유효하지 않습니다"));
    }

    /**
     * 필수 @RequestParam 누락 → 400 INVALID_INPUT.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestParameter(
            MissingServletRequestParameterException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 요청 파라미터가 누락되었습니다."));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestPart(
            MissingServletRequestPartException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 업로드 파일이 누락되었습니다."));
    }

    /**
     * @PathVariable / @RequestParam 의 enum / 타입 변환 실패 (예: 잘못된 enum path-variable) → 400.
     * dashboard-service / partner-service / notification-service 와 동일 패턴 일관 (PR #94 W4 후속 fix Q-W4-3).
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /** transaction timeout/rollback-only 표면을 스택트레이스 대신 재시도 안내로 반환한다. */
    @ExceptionHandler({TransactionTimedOutException.class, UnexpectedRollbackException.class})
    public ResponseEntity<ApiResponse<Void>> handleTransactionTimeout(Exception ex) {
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR,
                        "결재 생성 시간이 제한을 초과했습니다. 참조를 나누어 다시 시도해 주세요."));
    }

    /**
     * JPA 낙관락(optimistic locking) 충돌 — 409 CONFLICT 매핑.
     *
     * <p>{@code @Version} 필드 불일치 시 Hibernate 가 던지는 {@link ObjectOptimisticLockingFailureException}
     * 를 잡아 사용자 친화적 메시지로 변환한다. 프론트엔드는 409 수신 시 페이지를 새로고침하도록 안내한다.
     *
     * @param ex 낙관락 충돌 예외
     * @return 409 CONFLICT ApiResponse
     */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handleOptimisticLocking(
            ObjectOptimisticLockingFailureException ex) {
        log.warn("낙관적 잠금 충돌 감지: {}", ex.getMessage());
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT,
                        "동시 수정 충돌이 감지되었습니다. 페이지를 새로고침 후 다시 시도해 주세요."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("Unhandled exception in groupware-service", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
