package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.client.AuthPermissionAdminClient;
import com.samhanair.logis.arologis.client.AuthPermissionAdminClient.RolePagePermissionView;
import com.samhanair.logis.arologis.controller.ArologisPermissionAdminController;
import com.samhanair.logis.arologis.exception.ArologisExceptionHandler;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * {@link ArologisPermissionAdminController} 위임/스코프 가드 단위 IT.
 *
 * <p>{@code @RequirePermission} 권한 게이트는 {@link ArologisPermissionControllerIT} 의 @WebMvcTest
 * grant/deny 케이스에서 검증한다. 본 테스트는 client 위임과 arologis.* 스코프 가드(쓰기)를 직접 단언한다.
 */
class ArologisPermissionAdminControllerIT {

    private AuthPermissionAdminClient client;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        client = Mockito.mock(AuthPermissionAdminClient.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new ArologisPermissionAdminController(client))
                .setControllerAdvice(new ArologisExceptionHandler())
                .build();
    }

    /** GET 은 client.getRoleMatrix("arologis.") 로 위임하여 매트릭스를 그대로 반환한다. */
    @Test
    void getMatrix_delegatesWithArologisPrefix() throws Exception {
        RolePagePermissionView view = new RolePagePermissionView(
                "MASTER", "arologis.admin.permissions", "아로로지스 권한 관리", true, true);
        when(client.getRoleMatrix("arologis."))
                .thenReturn(Map.of("MASTER", Map.of("arologis.admin.permissions", view)));

        mockMvc.perform(get("/admin/arologis/permissions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.MASTER['arologis.admin.permissions'].canEdit").value(true));

        verify(client).getRoleMatrix("arologis.");
    }

    /** PUT arologis.* page-code 는 가드를 통과하여 client.updateRoleGrant 로 위임한다. */
    @Test
    void updateGrant_withArologisPageCode_delegates() throws Exception {
        RolePagePermissionView view = new RolePagePermissionView(
                "MANAGER", "arologis.region", "아로로지스 지역/구역 관리", true, true);
        when(client.updateRoleGrant("MANAGER", "arologis.region", true, true)).thenReturn(view);

        mockMvc.perform(put("/admin/arologis/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleCode\":\"MANAGER\",\"pageCode\":\"arologis.region\","
                                + "\"canView\":true,\"canEdit\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pageCode").value("arologis.region"));

        verify(client).updateRoleGrant("MANAGER", "arologis.region", true, true);
    }

    /** PUT 비-arologis page-code 는 FORBIDDEN 가드로 거부하고 client 를 호출하지 않는다. */
    @Test
    void updateGrant_withNonArologisPageCode_isForbiddenAndNotDelegated() throws Exception {
        mockMvc.perform(put("/admin/arologis/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleCode\":\"ACCOUNTANT\",\"pageCode\":\"accounting.journals\","
                                + "\"canView\":true,\"canEdit\":true}"))
                .andExpect(status().isForbidden());

        verify(client, never()).updateRoleGrant(eq("ACCOUNTANT"), eq("accounting.journals"),
                anyBoolean(), anyBoolean());
    }
}
