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
 * <p>RC5 fix — MASTER bypass: {@link com.samhanair.logis.security.permission.PermissionAspect}
 * 가 {@code @RequirePermission} 경로에서 MASTER 를 동적 DB 조회 없이 통과시키는 것과 동일하게,
 * 본 programmatic guard 도 X-User-Role 이 MASTER 이면 override row 조회 없이 통과한다.
 * 이전에는 GET 조회 endpoint 가 {@code @RequirePermission} 없이 본 guard 만 호출했고, write
 * endpoint 도 aspect 통과 후 본 guard 에서 재차 {@code check()} 를 호출하여 MASTER (override row
 * 미존재) 가 403 으로 차단되는 결함이 있었다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EstimatePermissionGuard {

    /** SP-D4 — 견적 목록 페이지 코드. */
    public static final String PAGE_CODE = "estimates.list";

    /** RC5 — MASTER 역할 코드 (PermissionAspect.isMasterBypass 와 동일 정책). */
    private static final String MASTER_ROLE = "MASTER";

    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * 견적 동적 VIEW 권한 검증.
     *
     * @param accountId 요청자 계정 UUID (X-User-Id 헤더)
     * @param role      요청자 역할 (X-User-Role 헤더). MASTER 면 동적 조회 없이 통과.
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkView(UUID accountId, String role) {
        check(accountId, role, PermissionAction.VIEW, "견적 목록 조회 권한이 없습니다.");
    }

    /**
     * 견적 mutation 권한 검증.
     *
     * @param accountId 요청자 계정 UUID (X-User-Id 헤더)
     * @param role      요청자 역할 (X-User-Role 헤더). MASTER 면 동적 조회 없이 통과.
     * @param action    CREATE / UPDATE 등 endpoint 의미 action
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkEdit(UUID accountId, String role, PermissionAction action) {
        PermissionAction effectiveAction = action == null ? PermissionAction.UPDATE : action;
        check(accountId, role, effectiveAction, "견적 편집 권한이 없습니다.");
    }

    private void check(UUID accountId, String role, PermissionAction action, String message) {
        if (isMasterBypass(role)) {
            return;
        }
        if (accountId == null || !dynamicPermissionClient.check(accountId, PAGE_CODE, action)) {
            log.debug("[SP-PO-10] 견적 동적 권한 deny — accountId={} role={} pageCode={} action={}",
                    accountId, role, PAGE_CODE, action);
            throw new BusinessException(ErrorCode.FORBIDDEN, message);
        }
    }

    /**
     * MASTER 역할이면 모든 견적 read/edit 를 통과시킨다 (RC5).
     *
     * @param role X-User-Role 헤더 값 (null/blank 허용)
     * @return MASTER 면 {@code true}
     */
    private boolean isMasterBypass(String role) {
        return MASTER_ROLE.equalsIgnoreCase(role);
    }
}
