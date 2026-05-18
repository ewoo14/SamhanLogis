package com.samhanair.logis.slip.client;

/**
 * 영수증 OCR client interface (SP-09-3).
 *
 * <p>전송 방식:
 * <ul>
 *   <li>{@code DRY_RUN} (기본) — 실제 API 호출 없이 즉시 mock 응답 반환.
 *       가게명 "테스트마트", 총액 12345, 부가세 1234, 발행일 LocalDate.now().</li>
 *   <li>{@code CLOVA} (Phase 11 sandbox) — Naver Clova OCR 실 API 호출.
 *       ENV {@code CLOVA_OCR_API_KEY} + {@code CLOVA_OCR_SECRET_KEY} +
 *       {@code CLOVA_OCR_INVOKE_URL} 필요.
 *       현 슬라이스는 placeholder runtime guard 만 적용, 실 호출 로직은 Phase 11 구현.</li>
 * </ul>
 *
 * <p>구현체: {@link ReceiptOcrClientImpl}. IT 에서는 {@code @MockBean} 격리
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
public interface ReceiptOcrClient {

    /**
     * 영수증 이미지를 OCR 로 파싱한다.
     *
     * <p>전송 방식 우선순위: {@code submitMethod} 파라미터가 null 이 아닌 경우 파라미터 우선.
     * null/blank 이면 {@code ocr.submit-method} application property (기본값 {@code DRY_RUN}) 사용.
     *
     * <p>DRY_RUN 모드: 즉시 mock {@link ReceiptOcrResult#success} 반환.
     * CLOVA 모드: 실 API 호출 미구현 — placeholder 차단 후 OCR_SUBMIT_FAILED 예외.
     *
     * @param imageBytes   영수증 이미지 바이트 배열
     * @param filename     원본 파일명 (확장자 포함)
     * @param submitMethod 전송 방식 ("DRY_RUN" | "CLOVA"). null/blank 이면 서버 property fallback.
     * @return OCR 파싱 결과 ({@link ReceiptOcrResult})
     * @throws com.samhanair.logis.common.exception.BusinessException(OCR_SUBMIT_FAILED)
     *         CLOVA API 오류 또는 placeholder 키 차단 시
     */
    ReceiptOcrResult submit(byte[] imageBytes, String filename, String submitMethod);
}
