package com.samhanair.logis.slip.web.dto;

import jakarta.validation.constraints.Pattern;

/**
 * 영수증 OCR 파싱 요청 DTO (SP-09-3).
 *
 * <p>현재(Phase 10) Controller 는 {@code @RequestParam String submitMethod} 로 직접 수신하므로
 * 이 DTO 는 {@code @ModelAttribute} 바인딩에 사용되지 않는다.
 * Phase 11 에서 multipart form 파라미터를 통합 검증할 때 {@code @Valid @ModelAttribute} 로 전환 예정.
 *
 * <p>multipart/form-data 요청의 파라미터 부분을 바인딩한다.
 * 파일은 {@code MultipartFile} 로 별도 수신.
 *
 * @param submitMethod OCR 전송 방식 — "DRY_RUN" (기본, 즉시 mock) 또는 "CLOVA" (Phase 11 실 API).
 *                     null/blank 이면 서버 property {@code ocr.submit-method} fallback.
 *
 * @deprecated Phase 10 현재 미사용 — Phase 11 {@code @Valid @ModelAttribute} 전환 시 활성화.
 */
@Deprecated
@SuppressWarnings("DeprecatedIsStillUsed")
public record ReceiptParseRequest(

        @Pattern(regexp = "DRY_RUN|CLOVA",
                message = "submitMethod 는 DRY_RUN 또는 CLOVA 만 허용합니다.")
        String submitMethod
) {
    /**
     * submitMethod 기본값 "DRY_RUN" 반환 — null/blank 안전 접근자.
     *
     * @return 실제 전송 방식 (null 이면 "DRY_RUN")
     */
    public String effectiveSubmitMethod() {
        return (submitMethod == null || submitMethod.isBlank()) ? "DRY_RUN" : submitMethod;
    }
}
