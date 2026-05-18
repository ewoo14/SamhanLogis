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
 * <p>전송 방식 분기 우선순위:
 *
 * <ol>
 *   <li>{@code submit(invoice, submitMethod)} 파라미터가 null 이 아닌 경우 파라미터 우선</li>
 *   <li>파라미터가 null 이면 ENV {@code ETAX_SUBMIT_METHOD} (기본값 {@code DRY_RUN}) fallback</li>
 * </ol>
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

    /** 전송 방식 서버 기본값 — DRY_RUN | NTS. 기본값 DRY_RUN (Phase 11 이전). */
    @Value("${etax.submit-method:DRY_RUN}")
    private String defaultSubmitMethod;

    /** NTS API 키 — NTS 모드 전용. DRY_RUN 시 미사용. */
    @Value("${etax.nts-api-key:}")
    private String ntsApiKey;

    /** NTS API Base URL — NTS 모드 전용. DRY_RUN 시 미사용. */
    @Value("${etax.nts-base-url:}")
    private String ntsBaseUrl;

    /**
     * 세금계산서를 e-Tax 전송한다.
     *
     * <p>전송 방식 결정 순서: {@code submitMethod} 파라미터 우선, null/blank 이면 서버 property fallback.
     * 응답의 {@code submitMethod} 는 실제 수행된 방식을 반환하므로 클라이언트가 결과 확인 가능.
     *
     * @param invoice      ISSUED 상태의 세금계산서
     * @param submitMethod 요청 전송 방식 ("DRY_RUN" | "NTS"). null/blank 이면 서버 property 사용.
     * @return 제출 결과 (실제 수행된 submitMethod 포함)
     * @throws BusinessException(ETAX_SUBMIT_FAILED) NTS 실 API 오류 시
     */
    @Override
    public ETaxSubmitResult submit(TaxInvoice invoice, String submitMethod) {
        // 요청 파라미터 우선, null 이면 서버 property fallback
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank())
                ? submitMethod
                : defaultSubmitMethod;

        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return submitDryRun(invoice);
        } else if ("NTS".equalsIgnoreCase(effectiveMethod)) {
            return submitNts(invoice);
        } else {
            log.warn("[SP-09-1] 알 수 없는 submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
            return submitDryRun(invoice);
        }
    }

    /**
     * DRY_RUN 전송 — 즉시 성공.
     *
     * <p>eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}".
     * UUID 비공개 원칙: taxInvoiceNo 가 null 인 경우에도 UUID 를 fallback 으로 사용하지 않음.
     * ISSUED 상태에서만 호출 가능하므로 taxInvoiceNo 는 항상 존재해야 하나, null 일 경우 "UNKNOWN" 처리.
     */
    private ETaxSubmitResult submitDryRun(TaxInvoice invoice) {
        // UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md): UUID substring 사용 금지.
        // ISSUED 상태에서는 taxInvoiceNo 가 반드시 존재. null 은 방어 코드 경로.
        String taxInvoiceNo = invoice.getTaxInvoiceNo() != null
                ? invoice.getTaxInvoiceNo()
                : "UNKNOWN";
        String externalId = "DRY-" + taxInvoiceNo + "-" + Instant.now().toEpochMilli();
        log.info("[SP-09-1] DRY_RUN e-Tax 전송 — taxInvoiceNo={} externalId={}", taxInvoiceNo, externalId);
        return ETaxSubmitResult.success(externalId, "DRY_RUN");
    }

    /**
     * NTS 실 API 전송 — Phase 11 sandbox + 운영 PC .env 에서 활성화.
     * 현 슬라이스는 RestClient 구조만 준비, 실 호출 로직은 Phase 11 구현 예정.
     *
     * <p>런타임 guard:
     * <ul>
     *   <li>{@code ntsApiKey} 가 blank 이면 즉시 ETAX_SUBMIT_FAILED</li>
     *   <li>{@code ntsApiKey} 가 알려진 placeholder 값 ("PLACEHOLDER_DEV_ONLY", "CHANGE_ME_LOCAL_ONLY",
     *       "changeme", "dummy") 이면 즉시 ETAX_SUBMIT_FAILED — 실수로 placeholder 를 그대로 사용하는 경우 차단.
     *       SP-09 vendor 통합 정책 4 키워드 (NTS/Aligo/Clova/KFTC 일관).</li>
     * </ul>
     *
     * @throws BusinessException(ETAX_SUBMIT_FAILED) API 키 미설정·placeholder·API 호출 실패 시
     */
    private ETaxSubmitResult submitNts(TaxInvoice invoice) {
        if (ntsApiKey == null || ntsApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "NTS_API_KEY 미설정 — etax.nts-api-key 환경변수를 확인하세요");
        }
        // placeholder 런타임 차단 — 실수로 개발용 placeholder 를 운영·sandbox 에서 사용하는 경우 방지.
        if (isPlaceholderApiKey(ntsApiKey)) {
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "NTS_API_KEY 가 placeholder 입니다. 실 sandbox 키 설정 필요.");
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

    /**
     * 알려진 placeholder API 키 판별.
     *
     * <p>대소문자 무시 비교. 신규 placeholder 추가 시 이 메서드만 수정.
     *
     * @param apiKey 검사할 API 키
     * @return placeholder 이면 true
     */
    private boolean isPlaceholderApiKey(String apiKey) {
        String lower = apiKey.toLowerCase(java.util.Locale.ROOT);
        return lower.equals("placeholder_dev_only")
                || lower.equals("change_me_local_only")
                || lower.equals("changeme")
                || lower.equals("dummy");
    }
}
