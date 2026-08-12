package com.samhanair.logis.partnerauth.exception;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import jakarta.servlet.http.HttpServletRequest;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.beans.factory.annotation.Value;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import com.samhanair.logis.partnerauth.audit.PartnerAuditClientIpResolver;

/** Partner Auth Service — 표준 ApiResponse 매핑. */
@RestControllerAdvice
public class PartnerAuthExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(PartnerAuthExceptionHandler.class);
    private final AuditPublisher auditPublisher;
    private final PartnerAuditClientIpResolver clientIpResolver;

    public PartnerAuthExceptionHandler() { this(null, Set.of()); }
    public PartnerAuthExceptionHandler(AuditPublisher auditPublisher) { this(auditPublisher, Set.of()); }

    @org.springframework.beans.factory.annotation.Autowired
    public PartnerAuthExceptionHandler(AuditPublisher auditPublisher,
                                       @Value("${samhan.audit.trusted-gateway-addresses:}") String trustedGatewayAddresses) {
        this(auditPublisher, parseAddresses(trustedGatewayAddresses));
    }

    public PartnerAuthExceptionHandler(AuditPublisher auditPublisher, Set<String> trustedGatewayAddresses) {
        this.auditPublisher = auditPublisher;
        this.clientIpResolver = new PartnerAuditClientIpResolver(trustedGatewayAddresses);
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        return ResponseEntity.status(code.getHttpStatus())
                .body(ApiResponse.fail(code, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex,
                                                               HttpServletRequest request) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .orElse("입력값이 유효하지 않습니다");
        auditFailure(request, 400, ErrorCode.INVALID_INPUT.name(), msg);
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, msg));
    }

    /**
     * JSON 본문 파싱 / enum 역직렬화 실패 → 400 INVALID_INPUT.
     *
     * @param ex 요청 본문 읽기 실패 예외
     * @return 400 INVALID_INPUT ApiResponse
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(HttpMessageNotReadableException ex,
                                                                       HttpServletRequest request) {
        auditFailure(request, 400, ErrorCode.INVALID_INPUT.name(), "요청 본문이 유효하지 않습니다");
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 본문이 유효하지 않습니다"));
    }

    private void auditFailure(HttpServletRequest request, int status, String code, String reason) {
        if (auditPublisher == null) return;
        auditPublisher.publishAfterCommit(AuditEventV2.failure(
                "partner-auth-service", request.getMethod(), request.getRequestURI(), status,
                code, reason, clientIpResolver.resolve(request), request.getHeader("User-Agent")));
    }

    private static Set<String> parseAddresses(String addresses) {
        return Arrays.stream((addresses == null ? "" : addresses).split(","))
                .map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
    }

    /**
     * JSON 전용 endpoint에 지원하지 않는 Content-Type이 전달되면 415로 알린다.
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "지원하지 않는 Content-Type입니다"));
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

    /**
     * @PathVariable / @RequestParam 타입 변환 실패 → 400 INVALID_INPUT.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
