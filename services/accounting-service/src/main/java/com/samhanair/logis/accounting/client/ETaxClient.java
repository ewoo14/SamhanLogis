package com.samhanair.logis.accounting.client;

import com.samhanair.logis.accounting.domain.TaxInvoice;

/**
 * NTS 홈택스 e-Tax 실 발행 client interface (SP-09-1).
 *
 * <p>전송 방식:
 *
 * <ul>
 *   <li>{@code DRY_RUN} — 실제 API 호출 없이 즉시 성공. {@code eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}"}
 *       본 슬라이스 기본 동작 (Phase 11 sandbox 연동 전)</li>
 *   <li>{@code NTS} — NTS 홈택스 실 API 호출. ENV {@code NTS_API_KEY} + {@code NTS_BASE_URL} 필요.
 *       Phase 11 sandbox + 운영 PC {@code .env} 에서 활성화</li>
 * </ul>
 *
 * <p>구현체: {@link ETaxClientImpl}. IT 에서는 {@code @MockBean} 격리
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
public interface ETaxClient {

    /**
     * 세금계산서를 NTS 홈택스에 제출한다.
     *
     * <p>DRY_RUN 모드: 즉시 {@link ETaxSubmitResult#success} 반환.
     * NTS 모드: 실 API 호출 — 실패 시 {@link ETaxSubmitResult#success}=false 또는 예외.
     *
     * @param invoice ISSUED 상태의 세금계산서
     * @return 제출 결과 (eTaxExternalId / submittedAt / success 포함)
     * @throws com.samhanair.logis.common.exception.BusinessException(ETAX_SUBMIT_FAILED) NTS API 오류
     */
    ETaxSubmitResult submit(TaxInvoice invoice);
}
