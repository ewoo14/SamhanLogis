package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RequirePermissionTest {

    @Test
    void actionIsEnum() throws Exception {
        var method = Sample.class.getMethod("op");
        RequirePermission annotation = method.getAnnotation(RequirePermission.class);

        assertThat(annotation.action()).isEqualTo(PermissionAction.CREATE);
    }

    static class Sample {
        @RequirePermission(page = "x.y", action = PermissionAction.CREATE)
        public void op() {
        }
    }
}
