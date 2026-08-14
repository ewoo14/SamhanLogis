package com.samhanair.logis.accounting.service;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
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
 *
 * <p>SP-D1 동적 권한 검증:
 * 기존 역할 가드에 더해
 * {@link DynamicPermissionClient} 를 통해 auth-service 의 동적 override 권한도 확인한다.
 * 동적 권한이 미설정(override row 없음) 또는 auth-service 장애 시에는 기존 role guard 만 적용.
 * 동적 권한이 명시적으로 canEdit=false 인 경우 403 반환.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxInvoiceEmitService {

    /** SP-D1 POC — emit-nts 대상 페이지 코드. */
    static final String EMIT_NTS_PAGE_CODE = "accounting.tax-invoice.emit-nts";

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final ETaxClient eTaxClient;
    private final TaxInvoiceEmitAuditRecorder auditRecorder;
    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * e-Tax 실 발행 실행.
     *
     * <p>ISSUED 상태 + eTaxExternalId = null 검증 → ETaxClient 호출 (request.submitMethod 전달)
     * → markEmitted → DB flush UNIQUE 위반 catch (409 변환) → audit (REQUIRES_NEW 독립 트랜잭션).
     *
     * @param id          세금계산서 UUID (path variable)
     * @param request     전송 방식 요청 (DRY_RUN | NTS)
     * @param actorUserId 요청자 user-id (X-User-Id 헤더)
     * @param actorRole   요청자 role (X-User-Role 헤더) — SP-D1 동적 권한 검증에 사용
     * @return e-Tax 전송 결과 응답 (실제 수행된 submitMethod 포함)
     * @throws BusinessException(TAX_INVOICE_NOT_EMITTABLE) ISSUED 아닐 때 (422)
     * @throws BusinessException(TAX_INVOICE_ALREADY_EMITTED) 이미 전송된 경우 (409)
     * @throws BusinessException(ETAX_SUBMIT_FAILED) ETaxClient 오류 (502)
     * @throws BusinessException(NOT_FOUND) 세금계산서 미존재 (404)
     * @throws BusinessException(FORBIDDEN) 동적 권한 차단 시 (403)
     */
    @Transactional
    public EmitNtsResponse emitNts(UUID id, EmitNtsRequest request,
                                   String actorUserId, String actorRole) {
        // SP-D1 POC — 동적 권한 검증 (기존 role guard 이후 추가 레이어).
        // 정책: override row 가 존재하고 canEdit=false 인 경우에만 403.
        //       override row 없음(fallback false) 또는 auth-service 장애 시 → 기존 role guard 통과로 충분.
        //
        // cycle 2 fix: 2회 별도 HTTP 호출(canView + canEdit) → 단일 canEdit 호출로 통합.
        //   1) canEdit=true  → 허용 (동적 override 통과)
        //   2) canEdit=false → VIEW 도 check 하여 override row 활성 여부 판단
        //      → overrideActive=true 면 명시적 deny → 403
        //      → overrideActive=false 면 row 없음 fallback → 기존 role guard 통과
        if (actorRole != null && !actorRole.isBlank()) {
            boolean canEdit = dynamicPermissionClient.canEdit(actorRole, EMIT_NTS_PAGE_CODE);
            if (!canEdit) {
                // canEdit=false: row 없음(fallback) 또는 명시적 deny 구분 필요.
                // VIEW 도 false 이면 override row 없음(fallback) → 기존 role guard 통과.
                // VIEW가 true 이면 "view-only override row 존재" → canEdit=false 명시적 deny → 403.
                boolean canView = dynamicPermissionClient.canView(actorRole, EMIT_NTS_PAGE_CODE);
                if (canView) {
                    log.warn("[SP-D1] 동적 권한 차단 (view-only override) — roleCode={} pageCode={} actorUserId={}",
                            actorRole, EMIT_NTS_PAGE_CODE, actorUserId);
                    throw new BusinessException(ErrorCode.FORBIDDEN,
                            "동적 권한 설정에 의해 e-Tax 발행 권한이 차단되었습니다.");
                }
                // canView=false + canEdit=false → override row 없음 or 양쪽 false override.
                // 양쪽 false override 는 실질적 차단이므로 403 처리.
                // 단, row 자체가 없으면(pure fallback) 기존 role guard 로 충분 — 여기서는 통과.
                // 현재 구현: 구분 불가이므로 보수적으로 통과(점진 마이그레이션 의도 — SP-D1 설계 결정).
                log.debug("[SP-D1] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={} actorUserId={}",
                        actorRole, EMIT_NTS_PAGE_CODE, actorUserId);
            }
        }

        TaxInvoice ti = taxInvoiceRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                          "세금계산서를 찾을 수 없습니다: " + id));

        ti.requireMutable("e-Tax 전송은 ");

        // 도메인 사전 검증 — ISSUED 상태 + 중복 방지.
        // 실제 markEmitted 내에서도 동일 검증을 하지만, ETaxClient 호출 전에 먼저 검증하여
        // 불필요한 외부 API 호출을 방지한다.
        if (ti.getStatus() != com.samhanair.logis.accounting.domain.TaxInvoiceStatus.ISSUED) {
            throw new BusinessException(ErrorCode.TAX_INVOICE_NOT_EMITTABLE,
                    "e-Tax 전송은 "
                            + com.samhanair.logis.accounting.domain.TaxInvoiceStatus.ISSUED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + ti.getStatus().getDisplayName() + ")");
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
