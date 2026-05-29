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
     * @param accountId 요청자 계정 UUID (X-User-Id 헤더)
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkView(UUID accountId) {
        check(accountId, PermissionAction.VIEW, "견적 목록 조회 권한이 없습니다.");
    }

    /**
     * 견적 mutation 권한 검증.
     *
     * @param accountId 요청자 계정 UUID (X-User-Id 헤더)
     * @param action    CREATE / UPDATE 등 endpoint 의미 action
     * @throws BusinessException 계정 권한이 없거나 accountId 가 없으면 FORBIDDEN
     */
    public void checkEdit(UUID accountId, PermissionAction action) {
        PermissionAction effectiveAction = action == null ? PermissionAction.UPDATE : action;
        check(accountId, effectiveAction, "견적 편집 권한이 없습니다.");
    }

    private void check(UUID accountId, PermissionAction action, String message) {
        if (accountId == null || !dynamicPermissionClient.check(accountId, PAGE_CODE, action)) {
            log.debug("[SP-PO-10] 견적 동적 권한 deny — accountId={} pageCode={} action={}",
                    accountId, PAGE_CODE, action);
            throw new BusinessException(ErrorCode.FORBIDDEN, message);
        }
    }
}
