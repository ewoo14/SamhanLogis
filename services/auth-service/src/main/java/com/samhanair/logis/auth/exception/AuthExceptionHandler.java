package com.samhanair.logis.auth.exception;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Auth Service 전역 예외 핸들러 — {@link BusinessException} → {@link ApiResponse} 매핑.
 *
 * <p>PR #138 C-2 fix: {@link ErrorCode#TOO_MANY_REQUESTS} → HTTP 429 자동 매핑.
 * {@code BusinessException.getErrorCode().getHttpStatus()} 에서 실제 상태 코드를 읽으므로
 * 신규 {@link ErrorCode} 추가 시 핸들러 변경 불필요.
 *
 * <p>다른 서비스(partner-auth-service 등) 와 동일한 패턴을 준수한다.
 */
@RestControllerAdvice
public class AuthExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AuthExceptionHandler.class);

    /**
     * 비즈니스 예외 처리 — {@link ErrorCode} 의 HTTP 상태 코드로 응답.
     *
     * @param ex 비즈니스 예외 (rate-limit 429 포함)
     * @return {@link ApiResponse#fail(ErrorCode, String)} envelope
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        if (code == ErrorCode.TOO_MANY_REQUESTS) {
            log.warn("Rate limit 초과: {}", ex.getMessage());
        }
        // getHttpStatus() 는 Lombok @Getter 생성 — int 오버로드로 null-warning 우회
        return ResponseEntity.status(code.getHttpStatus().value())
                .body(ApiResponse.fail(code, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /**
     * Bean Validation 실패 처리 — 첫 번째 필드 오류 메시지를 400 으로 반환.
     *
     * @param ex 유효성 검증 예외
     * @return HTTP 400 {@link ApiResponse}
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .orElse("입력값이 유효하지 않습니다");
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, msg));
    }

    /**
     * JSON 본문 파싱 / enum 역직렬화 실패 → 400 INVALID_INPUT.
     *
     * @param ex 요청 본문 읽기 실패 예외
     * @return HTTP 400 {@link ApiResponse}
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 본문이 유효하지 않습니다"));
    }

    /**
     * 필수 요청 파라미터 누락 → 400 INVALID_INPUT.
     *
     * @param ex 요청 파라미터 누락 예외
     * @return HTTP 400 {@link ApiResponse}
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingRequestParameter(
            MissingServletRequestParameterException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 요청 파라미터가 누락되었습니다."));
    }

    /**
     * 요청 파라미터 타입 변환 실패 → 400 INVALID_INPUT.
     *
     * @param ex 타입 변환 실패 예외
     * @return HTTP 400 {@link ApiResponse}
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    /**
     * Spring Security 권한 거부 처리.
     *
     * @param ex 접근 거부 예외
     * @return HTTP 403 {@link ApiResponse}
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /**
     * 처리되지 않은 예외 — 500 반환 및 서버 로그 기록.
     *
     * @param ex 예외
     * @return HTTP 500 {@link ApiResponse}
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("처리되지 않은 예외", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus().value())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
