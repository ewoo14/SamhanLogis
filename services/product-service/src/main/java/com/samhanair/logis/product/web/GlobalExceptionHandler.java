package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import com.samhanair.logis.product.quantitysync.QuantitySyncViolationTranslator;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.ConstraintViolationException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
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
     * 요청 파라미터 타입 변환 실패를 입력 오류 400으로 매핑한다.
     *
     * <p>예: {@code /api/v1/odu-recommendations?type=INVALID} 처럼 enum 값이
     * 일치하지 않는 경우 unknown handler 의 500으로 흘러가지 않게 차단한다.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "요청 파라미터 형식이 올바르지 않습니다."));
    }

    /**
     * 요소 단위 제약(@Valid 컬렉션 요소) 위반을 400 으로 매핑한다 (K-fix 완결).
     *
     * <p>{@code ProductCatalogController} 는 클래스 레벨 {@code @Validated} + 본문이
     * {@code @Valid @RequestBody List<DTO>} 라서, 컬렉션 <b>요소</b>의 빈 제약
     * (@NotBlank / @NotNull / @DecimalMax(999.99) / @Digits) 위반은
     * {@link MethodArgumentNotValidException} 이 아닌
     * {@link ConstraintViolationException} 으로 throw 된다. 핸들러가 없으면
     * catch-all {@link #handleUnknown}(500) 으로 흘러가 bean-validation 위반이
     * 500 으로 위장되므로 여기서 400 으로 선제 매핑한다.
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        String msg = ex.getConstraintViolations().stream()
                .findFirst()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .orElse("입력값이 유효하지 않습니다");
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, msg));
    }

    /**
     * 핸들러 메서드 파라미터 검증 실패를 400 으로 매핑한다 (향후 {@code @Validated} 제거 대비).
     *
     * <p>Spring 6.1+ 에서 컨트롤러 메서드 파라미터 제약 검증 실패는
     * {@link HandlerMethodValidationException} 으로 표면화될 수 있다(클래스 레벨
     * {@code @Validated} 가 제거되어 메서드 단위 검증 경로로 전환될 경우 등).
     * catch-all 500 회귀를 막기 위해 명시적으로 400 으로 매핑한다.
     */
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleHandlerMethodValidation(HandlerMethodValidationException ex) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT, "입력값이 유효하지 않습니다"));
    }

    /**
     * DB 무결성 제약 위반(부분 유니크 인덱스 등)을 409 CONFLICT 로 매핑한다 (#2 보조 방어).
     *
     * <p>구성품 replace-all 의 동시 PUT 경합으로 부분 유니크 인덱스
     * (bundle_product_id, component_product_code, is_deleted=false) 가 INSERT 단계에서
     * 위반되면 {@link DataIntegrityViolationException} 이 던져진다. PESSIMISTIC_WRITE
     * 직렬화(#2)로 1차 방어하되, 그래도 빠져나간 경합은 catch-all 500 이 아니라
     * 409 로 매핑하여 클라이언트가 재시도 가능한 충돌로 인식하게 한다.
     *
     * <p><b>재수렴 R4 결함 A [HIGH] fix</b> — 이 핸들러는 product-service 의 모든
     * {@link DataIntegrityViolationException} 이 지나는 유일한 통로다. V24 quantity_sync
     * deferred constraint trigger 위반(경로 무관 — usageScope 전이 · estimateCategories
     * 변경 · 향후 추가될 어떤 mutation 경로든 전부 이 예외로 도착)을
     * {@link QuantitySyncViolationTranslator} 로 먼저 가로채 원인을 드러내고, 그 트리거와
     * 무관한 나머지(예: 구성품 replace-all 동시 PUT 경합)는 기존 범용 409 로 그대로
     * 떨어진다 — 경로별 가드 대신 이 단일 통로에서 처리하므로 새 경로가 나와도 코드 변경
     * 없이 적용된다(U-1).
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        Optional<String> quantitySyncReason = QuantitySyncViolationTranslator.extractReason(ex);
        if (quantitySyncReason.isPresent()) {
            String message = QuantitySyncViolationTranslator.toUserMessage(quantitySyncReason.get());
            log.warn("quantity_sync 그래프 제약 위반 (경로 무관 통합 처리): {}", quantitySyncReason.get());
            return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                    .body(ApiResponse.fail(ErrorCode.CONFLICT, message));
        }
        log.warn("DataIntegrityViolation (동시 편집 충돌 또는 제약 위반)", ex);
        return ResponseEntity.status(ErrorCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT, "동시 편집 충돌 또는 제약 위반"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.FORBIDDEN, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    /**
     * JPA 단건 조회 실패를 404 로 매핑한다.
     *
     * <p>카탈로그 mutation/spec CRUD 는 사용자 노출 식별자(modelCode 또는 modelName fallback)
     * 로 제품을 조회한다. 완전 미존재 식별자는 서버 오류가 아니라 리소스 부재다.
     */
    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleEntityNotFound(EntityNotFoundException ex) {
        return ResponseEntity.status(ErrorCode.NOT_FOUND.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.NOT_FOUND, ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "서버 내부 오류가 발생했습니다."));
    }
}
