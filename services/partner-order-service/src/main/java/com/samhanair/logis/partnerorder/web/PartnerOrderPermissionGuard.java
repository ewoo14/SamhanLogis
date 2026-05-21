package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * SP-D4 거래처주문 동적 권한 가드 (공유 컴포넌트).
 *
 * <p>partner-order-service 의 여러 controller 가 공유하는 동적 RBAC VIEW/EDIT 검증 컴포넌트.
 * {@link DynamicPermissionClient} 를 통해 auth-service 의 override row 를 확인한다.
 *
 * <p>지원 페이지 코드 (다중 코드):
 * <ul>
 *   <li>{@code sales.partner-order.list} — 거래처주문 목록</li>
 *   <li>{@code sales.partner-order.draft} — 거래처주문 작성</li>
 *   <li>{@code sales.partner-order.confirm} — 주문 확정</li>
 *   <li>{@code sales.partner-order.history} — 주문 이력</li>
 *   <li>{@code sales.partner-order.print} — 주문서 인쇄</li>
 *   <li>{@code sales.vendor-order} — 벤더(외주) 주문</li>
 * </ul>
 *
 * <p>점진 마이그레이션 정책:
 * <ul>
 *   <li>actorRole null/blank → 건너뜀</li>
 *   <li>canView=false → {@link BusinessException}(FORBIDDEN) 명시적 deny</li>
 *   <li>canEdit=false + canView=true → EDIT 시 403 (view-only override deny)</li>
 *   <li>canEdit=false + canView=false → fallback 통과</li>
 * </ul>
 *
 * <p>IT 에서 {@code @MockBean} 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerOrderPermissionGuard {

    // ---- 지원 페이지 코드 상수 ----

    /** 거래처주문 목록 페이지 코드. */
    public static final String PAGE_LIST    = "sales.partner-order.list";
    /** 거래처주문 작성 페이지 코드. */
    public static final String PAGE_DRAFT   = "sales.partner-order.draft";
    /** 주문 확정 페이지 코드. */
    public static final String PAGE_CONFIRM = "sales.partner-order.confirm";
    /** 주문 이력 페이지 코드. */
    public static final String PAGE_HISTORY = "sales.partner-order.history";
    /** 주문서 인쇄 페이지 코드. */
    public static final String PAGE_PRINT   = "sales.partner-order.print";
    /** 벤더(외주) 주문 페이지 코드. */
    public static final String PAGE_VENDOR  = "sales.vendor-order";

    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * SP-D4 거래처주문 동적 VIEW 권한 검증.
     *
     * <p>canView=false → {@link BusinessException}(FORBIDDEN) 던짐.
     * actorRole null/blank → 건너뜀.
     *
     * @param actorRole 요청자 역할 (X-User-Role 헤더)
     * @param pageCode  검증할 페이지 코드 (PAGE_LIST / PAGE_DRAFT 등)
     * @throws BusinessException canView=false 인 경우 FORBIDDEN
     */
    public void checkView(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, pageCode);
        if (!canView) {
            log.debug("[SP-D4] 거래처주문 VIEW 동적 권한 deny — roleCode={} pageCode={}", actorRole, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN, "거래처주문 조회 권한이 없습니다.");
        }
    }

    /**
     * SP-D4 거래처주문 동적 EDIT 권한 검증.
     *
     * <p>canEdit=false + canView=true → 403 (view-only override deny).
     * canEdit=false + canView=false → fallback 통과.
     * actorRole null/blank → 건너뜀.
     *
     * @param actorRole 요청자 역할 (X-User-Role 헤더)
     * @param pageCode  검증할 페이지 코드
     * @throws BusinessException canEdit=false + canView=true 인 경우 FORBIDDEN
     */
    public void checkEdit(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, pageCode);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, pageCode);
            if (canView) {
                log.debug("[SP-D4] 거래처주문 EDIT 동적 권한 deny (view-only override) — roleCode={} pageCode={}",
                        actorRole, pageCode);
                throw new BusinessException(ErrorCode.FORBIDDEN, "거래처주문 편집 권한이 없습니다.");
            }
        }
    }
}
