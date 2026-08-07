package com.samhanair.logis.slip.estimate.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
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
                boolean.class,
                int.class,
                int.class,
                String.class,
                String.class));
        assertReadMethodContract(EstimateController.class.getMethod(
                "getOne",
                String.class,
                String.class,
                String.class));
    }

    @Test
    void writeEndpointsUseSingleRequirePermissionGuardWithoutManualSystemMasterGuard() throws Exception {
        List<WriteMethod> methods = List.of(
                new WriteMethod(EstimateController.class.getMethod(
                        "create", CreateEstimateRequest.class, String.class, String.class),
                        PermissionAction.CREATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "update", UUID.class, UpdateEstimateRequest.class, String.class, String.class),
                        PermissionAction.UPDATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "send", UUID.class, String.class),
                        PermissionAction.UPDATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "accept", UUID.class, String.class),
                        PermissionAction.UPDATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "reject", UUID.class, String.class),
                        PermissionAction.UPDATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "convert", UUID.class, String.class),
                        PermissionAction.UPDATE),
                new WriteMethod(EstimateController.class.getMethod(
                        "delete", UUID.class, String.class, String.class),
                        PermissionAction.DELETE),
                new WriteMethod(EstimateController.class.getMethod(
                        "restore", UUID.class),
                        PermissionAction.RESTORE)
        );

        for (WriteMethod writeMethod : methods) {
            Method method = writeMethod.method();
            RequirePermission annotation = method.getAnnotation(RequirePermission.class);
            assertThat(annotation).isNotNull();
            assertThat(annotation.page()).isEqualTo(EstimatePermissionGuard.PAGE_CODE);
            assertThat(annotation.action()).isEqualTo(writeMethod.action());
            assertThat(Arrays.stream(method.getParameterTypes()).filter(String.class::equals).count())
                    .as(method.getName() + " String header count")
                    .isLessThanOrEqualTo(2);
        }
    }

    private static void assertReadMethodContract(Method method) {
        assertThat(method.getAnnotation(RequirePermission.class)).isNull();
        PreAuthorize preAuthorize = method.getAnnotation(PreAuthorize.class);
        assertThat(preAuthorize).isNotNull();
        assertThat(preAuthorize.value()).isEqualTo("isAuthenticated()");
    }

    private record WriteMethod(Method method, PermissionAction action) {
    }
}
