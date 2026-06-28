package com.samhanair.logis.log.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** DEV-3 활동 로그 controller 권한 어노테이션 계약 검증. */
class ActivityLogControllerPermissionTest {

    @Test
    @DisplayName("/logs/activity는 dev.activity-log VIEW 권한으로 게이팅한다")
    void activityEndpointRequiresDevActivityLogView() throws Exception {
        Method method = AuditLogController.class.getMethod(
                "activity",
                String.class,
                String.class,
                String.class,
                String.class,
                String.class,
                java.time.Instant.class,
                java.time.Instant.class,
                int.class,
                int.class);

        RequirePermission annotation = method.getAnnotation(RequirePermission.class);

        assertThat(annotation).isNotNull();
        assertThat(annotation.page()).isEqualTo("dev.activity-log");
        assertThat(annotation.action()).isEqualTo(PermissionAction.VIEW);
    }
}
