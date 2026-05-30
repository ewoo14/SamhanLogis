package com.samhanair.logis.slip.estimate.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

/** SP-D7 cycle 4: 견적 조회 endpoint는 programmatic guard가 RBAC를 강제한다. */
class EstimateControllerSecurityContractTest {

    @Test
    void listAndDetailUseAuthenticatedGateAndProgrammaticEstimateGuard() throws Exception {
        assertReadMethodContract(EstimateController.class.getMethod(
                "list",
                EstimateStatus.class,
                UUID.class,
                LocalDate.class,
                LocalDate.class,
                int.class,
                int.class,
                String.class,
                String.class));
        assertReadMethodContract(EstimateController.class.getMethod(
                "getOne",
                UUID.class,
                String.class,
                String.class));
    }

    private static void assertReadMethodContract(Method method) {
        assertThat(method.getAnnotation(RequirePermission.class)).isNull();
        PreAuthorize preAuthorize = method.getAnnotation(PreAuthorize.class);
        assertThat(preAuthorize).isNotNull();
        assertThat(preAuthorize.value()).isEqualTo("isAuthenticated()");
    }
}
