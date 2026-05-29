package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PermissionInternalControllerTest {

    private AccountPermissionService accountPermissionService;
    private DynamicPermissionService dynamicPermissionService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        accountPermissionService = Mockito.mock(AccountPermissionService.class);
        dynamicPermissionService = Mockito.mock(DynamicPermissionService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PermissionInternalController(accountPermissionService, dynamicPermissionService))
                .build();
    }

    @Test
    void checkPermissionUsesAccountIdAndAction() throws Exception {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        given(accountPermissionService.check(accountId, "accounting.journals", PermissionAction.CREATE))
                .willReturn(true);

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/check")
                                .param("accountId", accountId.toString())
                                .param("pageCode", "accounting.journals")
                                .param("action", "CREATE"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("\"allowed\":true");
    }

    @Test
    void bulkLoadReturnsAccountMap() throws Exception {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        given(accountPermissionService.bulkLoad(accountId))
                .willReturn(Map.of("accounting.journals",
                        EnumSet.of(PermissionAction.VIEW, PermissionAction.DOWNLOAD)));

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/account/{accountId}", accountId))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("accounting.journals", "VIEW", "DOWNLOAD");
    }

    @Test
    void checkPermissionSupportsLegacyRoleFormWithoutAccountId() throws Exception {
        given(dynamicPermissionService.canAccess("MANAGER", "admin.employees", "VIEW"))
                .willReturn(true);

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/check")
                                .param("roleCode", "MANAGER")
                                .param("pageCode", "admin.employees")
                                .param("type", "VIEW"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("\"allowed\":true");
    }

    @Test
    void checkPermissionMapsRoleActionUpdateToEditPermissionType() throws Exception {
        given(dynamicPermissionService.canAccess("ACCOUNTANT", "accounting.journals", "EDIT"))
                .willReturn(false);

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/check")
                                .param("roleCode", "ACCOUNTANT")
                                .param("pageCode", "accounting.journals")
                                .param("action", "UPDATE"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("\"allowed\":false");
    }
}
