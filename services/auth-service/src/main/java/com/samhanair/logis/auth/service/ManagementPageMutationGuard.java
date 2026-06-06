package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/**
 * 관리 page-code 변경을 MASTER 전용으로 고정하는 공통 정책.
 *
 * <p>{@code system.permission-admin}, {@code hr.role-management},
 * {@code admin.permission-groups} 는 위임받은 비MASTER가 다시 부여, 회수, 상속시킬 수 없다.
 *
 * <p>C5-4 actor 전환: X-User-Role 헤더는 게이트웨이에서 더 이상 주입되지 않는다.
 * MASTER 판정은 {@code X-Is-System-Master: true} 헤더 유래 값으로만 수행한다.
 * {@link com.samhanair.logis.security.permission.PermissionAspect} 와 동일 정책.
 */
final class ManagementPageMutationGuard {

    private ManagementPageMutationGuard() {
    }

    /**
     * 관리 page-code 변경 시도이면 요청자가 시스템 MASTER 인지 확인한다.
     *
     * @param pageCode       변경 대상 page-code
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 MASTER)
     */
    static void rejectManagementPageMutation(String pageCode, String isSystemMaster) {
        if (PageCode.isManagementPageCode(pageCode) && !isSystemMaster(isSystemMaster)) {
            throw new BusinessException(
                    ErrorCode.FORBIDDEN,
                    "관리권한 page-code 는 MASTER 만 부여하거나 회수할 수 있습니다.");
        }
    }

    /**
     * X-Is-System-Master 헤더 값이 "true" 이면 MASTER 로 판정한다.
     *
     * <p>C5-4 전환: 이전 {@code isMaster(String actorRole)} 은 X-User-Role 헤더 값을 비교했으나,
     * 게이트웨이가 X-User-Role 을 더 이상 주입하지 않으므로
     * {@code X-Is-System-Master: true} 헤더 기반 판정으로 교체됨.
     *
     * @param isSystemMaster X-Is-System-Master 헤더 값 (null/blank 허용)
     * @return "true" 이면 {@code true}
     */
    static boolean isSystemMaster(String isSystemMaster) {
        return "true".equalsIgnoreCase(isSystemMaster == null ? "" : isSystemMaster.trim());
    }
}
