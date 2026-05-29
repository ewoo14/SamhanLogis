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

    @Test
    void partnerSelfServiceDefaultsFalse() throws Exception {
        var method = Sample.class.getMethod("op");
        RequirePermission annotation = method.getAnnotation(RequirePermission.class);

        assertThat(annotation.partnerSelfService()).isFalse();
    }

    @Test
    void partnerSelfServiceCanBeEnabledExplicitly() throws Exception {
        var method = Sample.class.getMethod("partnerSelfServiceOp");
        RequirePermission annotation = method.getAnnotation(RequirePermission.class);

        assertThat(annotation.partnerSelfService()).isTrue();
    }

    static class Sample {
        @RequirePermission(page = "x.y", action = PermissionAction.CREATE)
        public void op() {
        }

        @RequirePermission(page = "x.partner", partnerSelfService = true)
        public void partnerSelfServiceOp() {
        }
    }
}
