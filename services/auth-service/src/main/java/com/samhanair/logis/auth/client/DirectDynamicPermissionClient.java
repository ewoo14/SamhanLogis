package com.samhanair.logis.auth.client;

import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * auth-service 내부 전용 동적 권한 클라이언트.
 *
 * <p>auth-service 는 권한 테이블의 소유자이므로 HTTP round-trip 없이
 * {@link DynamicPermissionService} 에 직접 위임한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DirectDynamicPermissionClient implements DynamicPermissionClient {

    private final DynamicPermissionService permissionService;

    @Override
    public boolean canView(String roleCode, String pageCode) {
        return canAccess(roleCode, pageCode, "VIEW");
    }

    @Override
    public boolean canEdit(String roleCode, String pageCode) {
        return canAccess(roleCode, pageCode, "EDIT");
    }

    private boolean canAccess(String roleCode, String pageCode, String action) {
        try {
            return permissionService.canAccess(roleCode, pageCode, action);
        } catch (Exception ex) {
            log.warn("[SP-D6-1] auth-service 직접 권한 조회 실패 (fallback=false) — roleCode={} pageCode={} action={} error={}",
                    roleCode, pageCode, action, ex.getMessage());
            return false;
        }
    }
}
