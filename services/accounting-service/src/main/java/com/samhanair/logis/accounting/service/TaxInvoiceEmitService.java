package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.EmitNtsRequest;
import com.samhanair.logis.accounting.web.dto.EmitNtsResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세금계산서 e-Tax 실 발행 service (SP-09-1).
 *
 * <p>NTS 홈택스 전송 흐름:
 *
 * <ol>
 *   <li>ISSUED 상태 확인 — 아닐 시 TAX_INVOICE_NOT_EMITTABLE (422)</li>
 *   <li>중복 발행 확인 — eTaxExternalId != null 시 TAX_INVOICE_ALREADY_EMITTED (409)</li>
 *   <li>{@link ETaxClient#submit} 호출 — DRY_RUN 또는 NTS 실 전송</li>
 *   <li>ETaxClient 실패 시 ETAX_SUBMIT_FAILED (502) surface</li>
 *   <li>{@link TaxInvoice#markEmitted} 도메인 메서드로 eTaxExternalId 저장</li>
 *   <li>audit log 기록 — TAX_INVOICE_EMIT_NTS revision</li>
 * </ol>
 *
 * <p>submitMethod 는 request 에서 받지만, ETaxClientImpl 의 {@code etax.submit-method} property 가
 * 실제 분기 제어. request.submitMethod = NTS 인데 impl 이 DRY_RUN 으로 설정되어 있으면
 * 오류 대신 DRY_RUN 결과를 반환 (Phase 11 이전 방어 정책).
 *
 * <p>UUID 비공개: eTaxExternalId 는 외부 기관 발급 식별자로 내부 관리용 노출 허용.
 * 사용자 화면에서 UUID raw 형태 표시는 taxInvoiceNo 로 대체.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceEmitService {

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final ETaxClient eTaxClient;
    private final AccountingAuditLogService auditLogService;

    /**
     * e-Tax 실 발행 실행.
     *
     * <p>ISSUED 상태 + eTaxExternalId = null 검증 → ETaxClient 호출 → markEmitted → audit.
     *
     * @param id          세금계산서 UUID (path variable)
     * @param request     전송 방식 요청 (DRY_RUN | NTS)
     * @param actorUserId 요청자 user-id (X-User-Id 헤더)
     * @return e-Tax 전송 결과 응답
     * @throws BusinessException(TAX_INVOICE_NOT_EMITTABLE) ISSUED 아닐 때 (422)
     * @throws BusinessException(TAX_INVOICE_ALREADY_EMITTED) 이미 전송된 경우 (409)
     * @throws BusinessException(ETAX_SUBMIT_FAILED) ETaxClient 오류 (502)
     * @throws BusinessException(NOT_FOUND) 세금계산서 미존재 (404)
     */
    public EmitNtsResponse emitNts(UUID id, EmitNtsRequest request, String actorUserId) {
        TaxInvoice ti = taxInvoiceRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "세금계산서를 찾을 수 없습니다: " + id));

        // 도메인 사전 검증 — ISSUED 상태 + 중복 방지.
        // 실제 markEmitted 내에서도 동일 검증을 하지만, ETaxClient 호출 전에 먼저 검증하여
        // 불필요한 외부 API 호출을 방지한다.
        if (ti.getStatus() != com.samhanair.logis.accounting.domain.TaxInvoiceStatus.ISSUED) {
            throw new BusinessException(ErrorCode.TAX_INVOICE_NOT_EMITTABLE,
                    "e-Tax 전송은 ISSUED 상태에서만 허용됩니다 (현재: " + ti.getStatus() + ")");
        }
        if (ti.getETaxExternalId() != null && !ti.getETaxExternalId().isBlank()) {
            throw new BusinessException(ErrorCode.TAX_INVOICE_ALREADY_EMITTED,
                    "이미 e-Tax 전송된 세금계산서입니다 (externalId: " + ti.getETaxExternalId() + ")");
        }

        // ETaxClient 호출 — 실패 시 BusinessException(ETAX_SUBMIT_FAILED) 로 surface.
        ETaxSubmitResult result;
        try {
            result = eTaxClient.submit(ti);
        } catch (BusinessException bex) {
            log.error("[SP-09-1] ETaxClient 호출 실패 — taxInvoiceNo={} error={}",
                    ti.getTaxInvoiceNo(), bex.getMessage());
            throw bex;
        } catch (RuntimeException ex) {
            log.error("[SP-09-1] ETaxClient 예외 — taxInvoiceNo={} error={}",
                    ti.getTaxInvoiceNo(), ex.getMessage(), ex);
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "e-Tax 전송 중 예외 발생: " + ex.getMessage());
        }

        if (!result.success()) {
            log.warn("[SP-09-1] ETaxClient 실패 응답 — taxInvoiceNo={} message={}",
                    ti.getTaxInvoiceNo(), result.message());
            throw new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                    "e-Tax 전송 실패: " + result.message());
        }

        // 도메인 메서드로 eTaxExternalId 저장.
        ti.markEmitted(result.eTaxExternalId());

        // audit 기록 — TAX_INVOICE_EMIT_NTS revision.
        recordEmitAudit(ti, actorUserId, result);

        log.info("[SP-09-1] e-Tax 전송 완료 — taxInvoiceNo={} method={} externalId={}",
                ti.getTaxInvoiceNo(), result.submitMethod(), result.eTaxExternalId());

        return new EmitNtsResponse(
                ti.getTaxInvoiceNo(),
                ti.getStatus(),
                result.eTaxExternalId(),
                result.submittedAt(),
                result.submitMethod()
        );
    }

    /**
     * e-Tax 전송 완료 audit 기록.
     *
     * <p>fieldName = "eTaxExternalId", oldValue = null, newValue = externalId.
     * 실패해도 비즈니스 트랜잭션 차단하지 않음 (graceful).
     */
    private void recordEmitAudit(TaxInvoice ti, String actorUserId, ETaxSubmitResult result) {
        try {
            UUID actorId;
            try {
                actorId = UUID.fromString(actorUserId);
            } catch (IllegalArgumentException ignored) {
                actorId = new UUID(0L, 0L);
            }
            auditLogService.recordBatch(
                    ti.getId(),
                    actorId,
                    actorUserId,
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
