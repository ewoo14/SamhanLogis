package com.samhanair.logis.accounting.client;

import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * NTS 홈택스 e-Tax 실 발행 client 구현체 (SP-09-1).
 *
 * <p>전송 방식 분기 — ENV {@code ETAX_SUBMIT_METHOD} 로 제어:
 *
 * <ul>
 *   <li>{@code DRY_RUN} (기본) — 실제 API 호출 없이 즉시 성공 반환.
 *       {@code eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}"} 형식.</li>
 *   <li>{@code NTS} — NTS 홈택스 실 API 호출. ENV {@code NTS_API_KEY} + {@code NTS_BASE_URL} 필요.
 *       Phase 11 sandbox 연동 시 활성화. 현 슬라이스는 placeholder (RestClient 구조만 준비).</li>
 * </ul>
 *
 * <p>IT 격리: {@code @MockBean ETaxClient} 로 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>NTS API 자격증명은 운영 PC {@code .env} 또는 AWS SSM Parameter Store 에서 주입.
 * 코드 내 하드코딩 금지 (UUID 비공개 원칙 + 보안 정책).
 */
@Component
public class ETaxClientImpl implements ETaxClient {

    private static final Logger log = LoggerFactory.getLogger(ETaxClientImpl.class);

    /** 전송 방식 — DRY_RUN | NTS. 기본값 DRY_RUN (Phase 11 이전). */
    @Value("${etax.submit-method:DRY_RUN}")
    private String submitMethod;

    /** NTS API 키 — NTS 모드 전용. DRY_RUN 시 미사용. */
    @Value("${etax.nts-api-key:}")
    private String ntsApiKey;

    /** NTS API Base URL — NTS 모드 전용. DRY_RUN 시 미사용. */
    @Value("${etax.nts-base-url:}")
    private String ntsBaseUrl;

    /**
     * 세금계산서를 e-Tax 전송한다.
     *
     * <p>{@code etax.submit-method=DRY_RUN} (기본): 즉시 성공 반환.
     * {@code etax.submit-method=NTS}: 홈택스 실 API 호출 (Phase 11 구현 예정 — 현재 placeholder).
     *
     * @param invoice ISSUED 상태의 세금계산서
     * @return 제출 결과
     * @throws BusinessException(ETAX_SUBMIT_FAILED) NTS 실 API 오류 시
     */
    @Override
    public ETaxSubmitResult submit(TaxInvoice invoice) {
        if ("DRY_RUN".equalsIgnoreCase(submitMethod)) {
            return submitDryRun(invoice);
        } else if ("NTS".equalsIgnoreCase(submitMethod)) {
            return submitNts(invoice);
        } else {
            log.warn("[SP-09-1] 알 수 없는 etax.submit-method={} — DRY_RUN 으로 fallback", submitMethod);
            return submitDryRun(invoice);
        }
    }

    /**
     * DRY_RUN 전송 — 즉시 성공. eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}".
     */
    private ETaxSubmitResult submitDryRun(TaxInvoice invoice) {
        String taxInvoiceNo = invoice.getTaxInvoiceNo() != null
                ? invoice.getTaxInvoiceNo()
                : invoice.getId().toString().substring(0, 8);
        String externalId = "DRY-" + taxInvoiceNo + "-" + Instant.now().toEpochMilli();
        log.info("[SP-09-1] DRY_RUN e-Tax 전송 — taxInvoiceNo={} externalId={}", taxInvoiceNo, externalId);
        return ETaxSubmitResult.success(externalId, "DRY_RUN");
    }

    /**
     * NTS 실 API 전송 — Phase 11 sandbox + 운영 PC .env 에서 활성화.
     * 현 슬라이스는 RestClient 구조만 준비, 실 호출 로직은 Phase 11 구현 예정.
     *
     * @throws BusinessException(ETAX_SUBMIT_FAILED) API 호출 실패 시
     */
    private ETaxSubmitResult submitNts(TaxInvoice invoice) {
        if (ntsApiKey == null || ntsApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "NTS_API_KEY 미설정 — etax.nts-api-key 환경변수를 확인하세요");
        }
        if (ntsBaseUrl == null || ntsBaseUrl.isBlank()) {
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "NTS_BASE_URL 미설정 — etax.nts-base-url 환경변수를 확인하세요");
        }
        // TODO(Phase 11): RestClient 를 이용한 NTS 홈택스 실 API 호출 구현.
        // 현재는 구조만 준비 — 실 호출 시 BusinessException(ETAX_SUBMIT_FAILED) 로 surface.
        log.warn("[SP-09-1] NTS 실 API 호출 미구현 — Phase 11 sandbox 연동 예정. taxInvoiceNo={}",
                invoice.getTaxInvoiceNo());
        throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                "NTS 실 API 호출은 Phase 11 에서 구현 예정입니다.");
    }
}
