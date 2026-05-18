package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.EmitNtsRequest;
import com.samhanair.logis.accounting.web.dto.EmitNtsResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
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
 *   <li>{@link ETaxClient#submit(TaxInvoice, String)} 호출 — request.submitMethod 전달</li>
 *   <li>ETaxClient 실패 시 ETAX_SUBMIT_FAILED (502) surface</li>
 *   <li>{@link TaxInvoice#markEmitted} 도메인 메서드로 eTaxExternalId 저장</li>
 *   <li>JPA flush 경계 DB UNIQUE 위반 시 TAX_INVOICE_ALREADY_EMITTED (409) 변환</li>
 *   <li>audit log 기록 — TAX_INVOICE_EMIT_NTS revision (REQUIRES_NEW 격리 트랜잭션)</li>
 * </ol>
 *
 * <p>submitMethod 우선순위: request 파라미터 우선, 서버 property ({@code etax.submit-method}) 는 fallback.
 * 응답의 {@code submitMethod} 는 실제 수행된 방식을 반환하므로 클라이언트가 결과를 명확히 인식 가능.
 *
 * <p>audit 트랜잭션 격리: {@link TaxInvoiceEmitAuditRecorder#recordEmit} 는 {@code REQUIRES_NEW}
 * 전파로 비즈니스 트랜잭션과 독립 커밋된다. audit 예외가 비즈니스 롤백을 유발하지 않음.
 * 별도 bean 을 통해 호출하므로 Spring AOP proxy 가 올바르게 적용된다
 * (self-invocation 우회 문제 해소 — SP-09-1 cycle-1 Codex BE fix).
 *
 * <p>UUID 비공개: eTaxExternalId 는 외부 기관 발급 식별자로 내부 관리용 노출 허용.
 * 사용자 화면에서 UUID raw 형태 표시는 taxInvoiceNo 로 대체.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxInvoiceEmitService {

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final ETaxClient eTaxClient;
    private final TaxInvoiceEmitAuditRecorder auditRecorder;

    /**
     * e-Tax 실 발행 실행.
     *
     * <p>ISSUED 상태 + eTaxExternalId = null 검증 → ETaxClient 호출 (request.submitMethod 전달)
     * → markEmitted → DB flush UNIQUE 위반 catch (409 변환) → audit (REQUIRES_NEW 독립 트랜잭션).
     *
     * @param id          세금계산서 UUID (path variable)
     * @param request     전송 방식 요청 (DRY_RUN | NTS)
     * @param actorUserId 요청자 user-id (X-User-Id 헤더)
     * @return e-Tax 전송 결과 응답 (실제 수행된 submitMethod 포함)
     * @throws BusinessException(TAX_INVOICE_NOT_EMITTABLE) ISSUED 아닐 때 (422)
     * @throws BusinessException(TAX_INVOICE_ALREADY_EMITTED) 이미 전송된 경우 (409)
     * @throws BusinessException(ETAX_SUBMIT_FAILED) ETaxClient 오류 (502)
     * @throws BusinessException(NOT_FOUND) 세금계산서 미존재 (404)
     */
    @Transactional
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

        // ETaxClient 호출 — request.submitMethod 우선, 서버 property fallback.
        // 실패 시 BusinessException(ETAX_SUBMIT_FAILED) 로 surface.
        ETaxSubmitResult result;
        try {
            result = eTaxClient.submit(ti, request.submitMethod());
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
        // DB UNIQUE 제약 위반(e_tax_external_id UNIQUE INDEX) 발생 시 409 로 변환.
        // — race condition: 두 요청이 동시에 도달하여 앱 레벨 검증을 통과했더라도
        //   DB flush 시 UNIQUE 위반으로 중복 발행을 방지.
        try {
            ti.markEmitted(result.eTaxExternalId());
            taxInvoiceRepository.flush();
        } catch (DataIntegrityViolationException ex) {
            log.warn("[SP-09-1] DB UNIQUE 위반 — e_tax_external_id 중복 감지. taxInvoiceNo={}",
                    ti.getTaxInvoiceNo());
            throw new BusinessException(ErrorCode.TAX_INVOICE_ALREADY_EMITTED,
                    "이미 e-Tax 전송된 세금계산서입니다 (DB UNIQUE 위반).");
        }

        // actorUserId 파싱 — UUID 형식이 아닌 경우 (e.g. "accountant-1") UUID(0,0) 대체.
        UUID actorId;
        try {
            actorId = UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ignored) {
            actorId = new UUID(0L, 0L);
        }

        // audit 기록 — TAX_INVOICE_EMIT_NTS revision.
        // TaxInvoiceEmitAuditRecorder 별도 bean 을 통해 호출 → Spring AOP proxy 경유
        // → REQUIRES_NEW 전파 속성이 실제로 적용됨 (self-invocation 문제 해소).
        auditRecorder.recordEmit(ti, result, actorId);

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
}
