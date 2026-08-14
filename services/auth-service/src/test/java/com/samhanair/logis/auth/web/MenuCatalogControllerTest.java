package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MenuCatalogControllerTest {

    private AccountPermissionService permissionService;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        permissionService = Mockito.mock(AccountPermissionService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new MenuCatalogController(permissionService)).build();
    }

    @Test
    @DisplayName("일반 계정은 VIEW 권한이 있는 메뉴만 받는다")
    void returnsOnlyViewAllowedMenus() throws Exception {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000010");
        when(permissionService.bulkLoad(accountId)).thenReturn(Map.of(
                "dispatch.board", EnumSet.of(PermissionAction.VIEW),
                "arologis.dispatch.ops", EnumSet.of(PermissionAction.VIEW)));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders.get("/auth/admin/menu-catalog")
                        .header("X-User-Id", accountId.toString()))
                .andReturn().getResponse();

        JsonNode data = objectMapper.readTree(response.getContentAsString()).get("data");
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(data).hasSize(9);
        assertThat(response.getContentAsString()).doesNotContain(accountId.toString());
        assertThat(response.getContentAsString()).doesNotContain("/arologis/manual");
    }

    @Test
    @DisplayName("PARTNER와 잘못된 계정은 빈 catalog를 받는다")
    void failClosedForPartnerAndInvalidIdentity() throws Exception {
        MockHttpServletResponse partner = mockMvc.perform(MockMvcRequestBuilders.get("/auth/admin/menu-catalog")
                        .header("X-Is-Partner", "true"))
                .andReturn().getResponse();
        MockHttpServletResponse invalid = mockMvc.perform(MockMvcRequestBuilders.get("/auth/admin/menu-catalog")
                        .header("X-User-Id", "not-a-uuid"))
                .andReturn().getResponse();

        assertThat(objectMapper.readTree(partner.getContentAsString()).get("data")).isEmpty();
        assertThat(objectMapper.readTree(invalid.getContentAsString()).get("data")).isEmpty();
    }

    @Test
    @DisplayName("SYSTEM MASTER는 전체 공식 catalog를 받는다")
    void systemMasterGetsAllOfficialMenus() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders.get("/auth/admin/menu-catalog")
                        .header("X-Is-System-Master", "true"))
                .andReturn().getResponse();

        JsonNode data = objectMapper.readTree(response.getContentAsString()).get("data");
        assertThat(data).hasSize(98);
        assertThat(response.getContentAsString()).doesNotContain("/arologis/manual");
    }
}
