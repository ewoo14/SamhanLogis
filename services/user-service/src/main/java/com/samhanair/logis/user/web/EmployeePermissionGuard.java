package com.samhanair.logis.user.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * SP-D4 직원/계정 관리 동적 권한 가드 (공유 컴포넌트).
 *
 * <p>user-service 의 EmployeeController / AdminUserController 가 공유하는
 * 동적 RBAC VIEW/EDIT 검증 컴포넌트.
 * {@link DynamicPermissionClient} 를 통해 auth-service 의 override row 를 확인한다.
 *
 * <p>지원 페이지 코드 (다중 코드):
 * <ul>
 *   <li>{@code admin.employees} — 직원 관리</li>
 *   <li>{@code admin.users} — 계정(사용자) 관리</li>
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
public class EmployeePermissionGuard {

    /** 직원 관리 페이지 코드. */
    public static final String PAGE_EMPLOYEES = "admin.employees";
    /** 계정(사용자) 관리 페이지 코드. */
    public static final String PAGE_USERS     = "admin.users";

    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * SP-D4 직원/계정 관리 동적 VIEW 권한 검증.
     *
     * <p>canView=false → {@link BusinessException}(FORBIDDEN) 던짐.
     * actorRole null/blank → 건너뜀.
     *
     * @param actorRole 요청자 역할 (X-User-Role 헤더)
     * @param pageCode  검증할 페이지 코드 (PAGE_EMPLOYEES / PAGE_USERS)
     * @throws BusinessException canView=false 인 경우 FORBIDDEN
     */
    public void checkView(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, pageCode);
        if (!canView) {
            log.debug("[SP-D4] 직원/계정 VIEW 동적 권한 deny — roleCode={} pageCode={}", actorRole, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN, "직원/계정 관리 조회 권한이 없습니다.");
        }
    }

    /**
     * SP-D4 직원/계정 관리 동적 EDIT 권한 검증.
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
                log.debug("[SP-D4] 직원/계정 EDIT 동적 권한 deny (view-only override) — roleCode={} pageCode={}",
                        actorRole, pageCode);
                throw new BusinessException(ErrorCode.FORBIDDEN, "직원/계정 관리 편집 권한이 없습니다.");
            }
        }
    }
}
