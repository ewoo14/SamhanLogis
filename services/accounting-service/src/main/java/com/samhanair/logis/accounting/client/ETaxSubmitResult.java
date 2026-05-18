package com.samhanair.logis.accounting.client;

import java.time.Instant;

/**
 * NTS 홈택스 e-Tax 실 발행 결과 (SP-09-1).
 *
 * <p>ETaxClient.submit() 의 반환 DTO. ETaxClientImpl(DRY_RUN) 과
 * 추후 NTS 실 sandbox 구현체 양쪽에서 사용.
 *
 * @param eTaxExternalId 외부 발급 ID — DRY_RUN: "DRY-{taxInvoiceNo}-{epochMilli}", NTS 실: 홈택스 접수번호
 * @param submittedAt    전송 완료 시각 (UTC)
 * @param submitMethod   전송 방식 ("DRY_RUN" | "NTS")
 * @param success        전송 성공 여부
 * @param message        실패 시 에러 메시지, 성공 시 null 또는 빈 문자열
 */
public record ETaxSubmitResult(
        String eTaxExternalId,
        Instant submittedAt,
        String submitMethod,
        boolean success,
        String message
) {

    /**
     * 성공 결과 빌더.
     *
     * @param eTaxExternalId 외부 발급 ID
     * @param submitMethod   전송 방식
     * @return 성공 결과
     */
    public static ETaxSubmitResult success(String eTaxExternalId, String submitMethod) {
        return new ETaxSubmitResult(eTaxExternalId, Instant.now(), submitMethod, true, null);
    }

    /**
     * 실패 결과 빌더.
     *
     * @param submitMethod 전송 방식
     * @param message      실패 메시지
     * @return 실패 결과
     */
    public static ETaxSubmitResult failure(String submitMethod, String message) {
        return new ETaxSubmitResult(null, Instant.now(), submitMethod, false, message);
    }
}
