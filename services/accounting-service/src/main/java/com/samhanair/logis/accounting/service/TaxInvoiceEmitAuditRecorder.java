package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * e-Tax 실 발행 audit 기록 bean (SP-09-1 cycle-1 Codex BE fix).
 *
 * <p>동일 클래스(TaxInvoiceEmitService) 내부에서 {@code @Transactional(REQUIRES_NEW)} 을
 * 직접 호출하면 Spring AOP proxy 를 우회하여 전파 속성이 적용되지 않는다.
 * 이 문제를 해소하기 위해 별도 {@code @Service} bean 으로 분리하였다.
 *
 * <p>호출 흐름:
 * <pre>
 *   TaxInvoiceEmitService (proxy) → TaxInvoiceEmitAuditRecorder (proxy) → REQUIRES_NEW 신규 트랜잭션
 * </pre>
 *
 * <p>REQUIRES_NEW 격리 효과:
 * <ul>
 *   <li>비즈니스 트랜잭션(markEmitted flush)과 독립 커밋 — audit 예외가 비즈니스 롤백을 유발하지 않음.</li>
 *   <li>audit 기록이 비즈니스 트랜잭션 롤백 후에도 DB 에 남아 트러블슈팅 근거로 사용 가능.</li>
 * </ul>
 *
 * <p>audit 필드:
 * <ul>
 *   <li>{@code eTaxExternalId} — NTS 외부 발급 ID</li>
 *   <li>{@code submitMethod} — DRY_RUN | NTS</li>
 *   <li>{@code action} — TAX_INVOICE_EMIT_NTS (revision 식별용)</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxInvoiceEmitAuditRecorder {

    private final AccountingAuditLogService auditLogService;

    /**
     * e-Tax 전송 완료 audit 기록.
     *
     * <p>REQUIRES_NEW 전파: 비즈니스 트랜잭션과 독립된 별도 트랜잭션으로 커밋.
     * audit 예외 발생 시 비즈니스 트랜잭션(markEmitted commit)에 영향 없음 (graceful 처리).
     *
     * <p>actorUserId 가 UUID 형식이 아닌 경우 (e.g. "accountant-1") 은 UUID(0,0) 으로 대체.
     *
     * @param ti       발행 완료된 세금계산서 (taxInvoiceNo, id 포함)
     * @param result   ETaxClient 전송 결과 (eTaxExternalId, submitMethod 포함)
     * @param actorId  요청자 UUID (X-User-Id 파싱 완료 후 전달)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordEmit(TaxInvoice ti, ETaxSubmitResult result, UUID actorId) {
        try {
            auditLogService.recordBatch(
                    ti.getId(),
                    actorId,
                    actorId.toString(),
                    null,
                    List.of(
                            new ChangeEntry("eTaxExternalId", null, result.eTaxExternalId()),
                            new ChangeEntry("submitMethod", null, result.submitMethod()),
                            new ChangeEntry("action", null, "TAX_INVOICE_EMIT_NTS")
                    )
            );
        } catch (RuntimeException ex) {
            log.warn("[SP-09-1] audit 기록 실패 (graceful) — taxInvoiceNo={} error={}",
                    ti.getTaxInvoiceNo(), ex.getMessage());
        }
    }
}
