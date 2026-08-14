package com.samhanair.logis.inventory.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * accounting-service 호출 클라이언트 — 재고 실사 차이 자동 분개 trigger 용 (Phase 10 P2-6).
 *
 * <p>Phase 11 후 Kafka 이벤트 기반 권고 — 본 슬라이스에서는 outbox stub 발행 + Feign 동기 호출
 * fallback. accounting-service 의 {@code POST /accounting/journals} (CreateJournalRequest)
 * 에 차변/대변 swap 한 분개를 직접 전송한다.
 *
 * <p>한국 일반기업회계기준 분개 규칙:
 * <ul>
 *   <li>diffAmount &gt; 0 (재고 증가) — 차변 1462 재고자산 / 대변 9399 재고감모손실 (환입)</li>
 *   <li>diffAmount &lt; 0 (재고 감소) — 차변 9399 재고감모손실 / 대변 1462 재고자산</li>
 *   <li>diffAmount = 0 — no-op (호출자에서 사전 차단)</li>
 * </ul>
 *
 * <p>4xx → BusinessException(INVALID_INPUT)<br>
 * 5xx / connection refused → BusinessException(INTERNAL_ERROR)<br>
 * 응답은 ApiResponse&lt;JournalDetailResponse&gt; envelope 이지만 본 클라이언트는 status 만 검증.
 */
@Component
public class AccountingClient {

    private static final Logger log = LoggerFactory.getLogger(AccountingClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String ACCOUNTING_SERVICE_BASE = "http://accounting-service";

    /** 개발책임자 결정 — 재고자산. */
    public static final String ACCOUNT_CODE_INVENTORY = "1462";

    /** V101 이관 정본 — 재고감모손실. */
    public static final String ACCOUNT_CODE_INVENTORY_LOSS = "9399";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public AccountingClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                            InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(ACCOUNTING_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 재고 실사 차이에 대한 자동 조정 분개를 accounting-service 에 생성 요청한다.
     *
     * <p>diffAmount 부호에 따라 차변/대변 계정을 결정. 라인 2건 (재고자산 ↔ 재고감모손실).
     * Phase 11 후 Kafka 이벤트로 전환되면 본 메서드는 outbox stub publish 로 대체.
     *
     * @param auditId    실사 ID (memo + sourceRef 추적용)
     * @param auditNo    실사번호 (사용자 노출 식별자, memo 본문)
     * @param auditDate  실사 일자 (분개 일자로 사용)
     * @param diffAmount 차이 금액 (양수=재고 증가, 음수=재고 감소; 0 은 호출자에서 차단)
     * @throws BusinessException(INVALID_INPUT) accounting-service 가 4xx 반환 또는 diffAmount=0
     * @throws BusinessException(INTERNAL_ERROR) accounting-service 5xx, 연결 실패, internal token 미설정
     */
    public void createAuditAdjustmentJournal(UUID auditId, String auditNo,
                                             LocalDate auditDate, BigDecimal diffAmount) {
        if (diffAmount == null || diffAmount.signum() == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "차이 금액이 0인 실사는 분개를 생성할 수 없습니다");
        }

        BigDecimal abs = diffAmount.abs();
        boolean increase = diffAmount.signum() > 0;

        // 라인 2건 — 차변/대변 swap
        Map<String, Object> debitLine = Map.of(
                "accountCode", increase ? ACCOUNT_CODE_INVENTORY : ACCOUNT_CODE_INVENTORY_LOSS,
                "debitAmount", abs,
                "creditAmount", BigDecimal.ZERO,
                "memo", "재고 실사 조정 (" + auditNo + ") — 차변");

        Map<String, Object> creditLine = Map.of(
                "accountCode", increase ? ACCOUNT_CODE_INVENTORY_LOSS : ACCOUNT_CODE_INVENTORY,
                "debitAmount", BigDecimal.ZERO,
                "creditAmount", abs,
                "memo", "재고 실사 조정 (" + auditNo + ") — 대변");

        Map<String, Object> body = Map.of(
                "journalDate", auditDate.toString(),
                "description", "재고 실사 자동 분개 (" + auditNo + ")",
                "lines", List.of(debitLine, creditLine));

        try {
            restClient.post()
                    .uri("/internal/accounting/journals")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "accounting-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "accounting-service 호출 실패: " + res.getStatusCode());
                    })
                    .toBodilessEntity();
            log.info("재고 실사 자동 분개 생성 요청 완료 — auditId={}, auditNo={}, diff={}",
                    auditId, auditNo, diffAmount);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("AccountingClient createAuditAdjustmentJournal 실패: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service 호출 실패", ex);
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }
}
