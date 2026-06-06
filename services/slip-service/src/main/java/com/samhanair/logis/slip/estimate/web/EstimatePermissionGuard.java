package com.samhanair.logis.slip.estimate.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 견적 계정 단위 동적 권한 가드.
 *
 * <p>EstimateController 가 사용하는 동적 RBAC 7-action 검증 컴포넌트.
 * {@link DynamicPermissionClient} 를 통해 auth-service 의 override row 를 확인한다.
 *
 * <p>페이지 코드: {@code estimates.list}
 *
 * <p>C5-4 actor 전환 — MASTER bypass 판정 기준:
 * {@code X-Is-System-Master} 헤더 값 {@code "true"} (게이트웨이가 JWT claim 에서 주입).
 * {@link com.samhanair.logis.security.permission.PermissionAspect} 의 MASTER bypass 정책과 완전 동일.
 * 이전에 사용하던 {@code X-User-Role=MASTER} 비교는 게이트웨이가 더 이상 주입하지 않으므로 제거됨.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EstimatePermissionGuard {

    /** SP-D4 — 견적 목록 페이지 코드. */
    public static final String PAGE_CODE = "estimates.list";

    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * 견적 동적 VIEW 권한 검증.
     *
     * @param accountId      요청자 계정 UUID (X-User-Id 헤더)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 MASTER bypass)
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkView(UUID accountId, String isSystemMaster) {
        check(accountId, isSystemMaster, PermissionAction.VIEW, "견적 목록 조회 권한이 없습니다.");
    }

    /**
     * 견적 mutation 권한 검증.
     *
     * @param accountId      요청자 계정 UUID (X-User-Id 헤더)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 MASTER bypass)
     * @param action         CREATE / UPDATE 등 endpoint 의미 action
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkEdit(UUID accountId, String isSystemMaster, PermissionAction action) {
        PermissionAction effectiveAction = action == null ? PermissionAction.UPDATE : action;
        check(accountId, isSystemMaster, effectiveAction, "견적 편집 권한이 없습니다.");
    }

    private void check(UUID accountId, String isSystemMaster, PermissionAction action, String message) {
        if (isMasterBypass(isSystemMaster)) {
            return;
        }
        if (accountId == null || !dynamicPermissionClient.check(accountId, PAGE_CODE, action)) {
            log.debug("[SP-PO-10] 견적 동적 권한 deny — accountId={} pageCode={} action={}",
                    accountId, PAGE_CODE, action);
            throw new BusinessException(ErrorCode.FORBIDDEN, message);
        }
    }

    /**
     * X-Is-System-Master 헤더 값이 "true" 이면 MASTER bypass (대소문자 무관).
     *
     * <p>게이트웨이가 JWT {@code isMaster} claim 에서 주입하는 헤더로,
     * {@link com.samhanair.logis.security.permission.PermissionAspect} 와 동일 정책.
     * X-User-Role 은 게이트웨이에서 더 이상 주입되지 않으므로 사용하지 않는다.
     *
     * @param isSystemMaster X-Is-System-Master 헤더 값 (null / blank 허용)
     * @return "true" 이면 {@code true}
     */
    private boolean isMasterBypass(String isSystemMaster) {
        return "true".equalsIgnoreCase(isSystemMaster == null ? "" : isSystemMaster.trim());
    }
}
