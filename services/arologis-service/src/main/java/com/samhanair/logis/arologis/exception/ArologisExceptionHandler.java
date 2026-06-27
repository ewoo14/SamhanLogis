package com.samhanair.logis.arologis.exception;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/**
 * arologis-service 도메인 예외 → {@link ApiResponse} 봉투 매핑.
 * dashboard-service / partner-service 와 동일 패턴.
 */
@RestControllerAdvice
public class ArologisExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ArologisExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        return ResponseEntity.status(code.getHttpStatus())
                .body(ApiResponse.fail(code, ex.getMessage()));
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
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, ex.getMessage()));
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
     * multipart 필수 파일 누락 → 400 INVALID_INPUT.
     *
     * <p>Spring 이 제공하는 raw part name({@code files}, {@code file} 등)은 응답에 노출하지 않는다.
     */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingPart(MissingServletRequestPartException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT,
                        "필수 업로드 파일이 누락되었습니다."));
    }

    /**
     * 필수 {@code @RequestParam} 누락 → 400 INVALID_INPUT.
     *
     * <p>{@code files} 가 {@code @RequestParam} 으로 선언되어 있어 multipart 컨테이너 구성에 따라
     * {@link MissingServletRequestParameterException} 으로 표면화될 수도 있다. 동일하게 400 으로 매핑한다.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "필수 요청 파라미터가 누락되었습니다."));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("Unhandled exception in arologis-service", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
