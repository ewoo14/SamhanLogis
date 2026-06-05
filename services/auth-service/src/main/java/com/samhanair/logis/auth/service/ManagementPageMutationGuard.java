package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/**
 * 관리 page-code 변경을 MASTER 전용으로 고정하는 공통 정책.
 *
 * <p>{@code system.permission-admin}, {@code hr.role-management},
 * {@code admin.permission-groups} 는 위임받은 비MASTER가 다시 부여, 회수, 상속시킬 수 없다.
 */
final class ManagementPageMutationGuard {

    private ManagementPageMutationGuard() {
    }

    /**
     * 관리 page-code 변경 시도이면 요청자 role 이 MASTER 인지 확인한다.
     *
     * @param pageCode  변경 대상 page-code
     * @param actorRole 요청자 role header 값
     */
    static void rejectManagementPageMutation(String pageCode, String actorRole) {
        if (PageCode.isManagementPageCode(pageCode) && !isMaster(actorRole)) {
            throw new BusinessException(
                    ErrorCode.FORBIDDEN,
                    "관리권한 page-code 는 MASTER 만 부여하거나 회수할 수 있습니다.");
        }
    }

    /**
     * 요청자 role 이 MASTER 인지 확인한다.
     *
     * @param actorRole 요청자 role header 값
     * @return MASTER 이면 {@code true}
     */
    static boolean isMaster(String actorRole) {
        return "MASTER".equalsIgnoreCase(actorRole == null ? "" : actorRole.trim());
    }
}
