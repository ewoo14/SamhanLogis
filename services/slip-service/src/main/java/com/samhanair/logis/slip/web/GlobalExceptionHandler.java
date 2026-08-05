package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import jakarta.persistence.LockTimeoutException;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.PessimisticLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/** Maps {@link BusinessException} and validation errors to {@link ApiResponse} envelopes. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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

    /**
     * 필수 요청 파라미터 누락 — 400 반환.
     *
     * <p>{@code @RequestParam(required = true)} (기본값) 파라미터가 없을 때
     * Spring MVC 가 던지는 예외. 기존 핸들러가 누락되어 500 으로 폴백하던 문제 수정
     * (audit Slice 2 P0 — SlipSalesQueryController from/to 파라미터 오류 응답 정상화).
     *
     * @param ex 파라미터 누락 예외
     * @return 400 INVALID_INPUT ApiResponse
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(
            MissingServletRequestParameterException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 요청 파라미터가 누락되었습니다."));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingPart(
            MissingServletRequestPartException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 업로드 파일이 누락되었습니다."));
    }

    /**
     * 요청 파라미터 타입 불일치 — 400 반환.
     *
     * <p>{@code @RequestParam} 타입 변환 실패 시 (예: LocalDate 파싱 오류) Spring MVC 가 던지는 예외.
     *
     * @param ex 타입 불일치 예외
     * @return 400 INVALID_INPUT ApiResponse
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    /**
     * JSON 본문 역직렬화 실패 — enum 자유 문자열 등 요청 body 타입 오류를 400 으로 고정한다.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(
            HttpMessageNotReadableException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 본문 형식이 올바르지 않습니다."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /**
     * 낙관적 락({@code @Version}) 충돌 — 409 CONFLICT 반환 (§7 협업 Round C P2).
     *
     * <p>service 레이어가 {@code applyMutation} 등으로 직접 매핑하지 못하고 flush/commit 시점에
     * 터지는 {@code ObjectOptimisticLockingFailureException}(Spring, StaleObjectStateException wrap)
     * 과 {@code OptimisticLockException}(jakarta) 이 기존에는 {@link #handleUnknown} 으로 폴백되어
     * 500 + entity FQCN/PK 등 내부 메시지가 노출되던 문제를 차단한다. 내부 메시지는 응답에 싣지 않고
     * 일반 한국어 메시지만 반환한다 — EstimateService/SlipService 의 OptimisticLock→CONFLICT 매핑
     * 컨벤션과 정렬 (전 전표 endpoint 공통 수혜).
     *
     * @param ex 낙관적 락 충돌 예외
     * @return 409 CONFLICT ApiResponse (내부 메시지 미노출)
     */
    @ExceptionHandler({OptimisticLockException.class, OptimisticLockingFailureException.class})
    public ResponseEntity<ApiResponse<Void>> handleOptimisticLock(Exception ex) {
        log.warn("Optimistic lock conflict: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, "동시 수정 충돌 — 다시 시도해 주세요"));
    }

    /**
     * 비관적 락 획득 실패/timeout — 일반 500 대신 재확인 가능한 409로 반환한다.
     *
     * <p>협업 저장의 행 잠금은 저장 원자성을 위한 것이므로 잠금 경합은 사용자 입력 오류가 아니다.
     * 잠금 예외를 내부 오류로 내려보내면 같은 필드 stale 409와 다른 필드 병합 의미를 잃고,
     * 내부 JDBC/Hibernate 메시지가 응답에 노출될 수 있다.
     */
    @ExceptionHandler({
            LockTimeoutException.class,
            PessimisticLockException.class,
            PessimisticLockingFailureException.class
    })
    public ResponseEntity<ApiResponse<Void>> handlePessimisticLock(Exception ex) {
        log.warn("Pessimistic lock conflict: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, "다른 사용자가 전표를 수정 중입니다. 최신 내용으로 다시 확인해 주세요."));
    }

    @ExceptionHandler(QueryTimeoutException.class)
    public ResponseEntity<ApiResponse<Void>> handleQueryTimeout(QueryTimeoutException ex) {
        log.warn("Query timeout: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "요청 처리 시간이 초과되었습니다."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Data integrity conflict: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, "데이터 중복 또는 무결성 충돌입니다."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
