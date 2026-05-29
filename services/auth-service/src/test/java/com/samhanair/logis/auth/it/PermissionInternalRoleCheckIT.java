package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** role_page_permissions 기반 내부 role-form 권한 조회 HTTP 계약 회귀 테스트. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class PermissionInternalRoleCheckIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("role-form /auth/internal/permissions/check 는 accountId 없이 VIEW grant 를 허용한다")
    void roleFormCheckAllowsGrantedViewWithoutAccountId() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/internal/permissions/check")
                        .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                        .param("roleCode", "MANAGER")
                        .param("pageCode", "admin.employees")
                        .param("type", "VIEW"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString()).contains("\"allowed\":true");
    }

    @Test
    @DisplayName("role-form /auth/internal/permissions/check 는 role_page_permissions deny 를 allowed:false 로 반환한다")
    void roleFormCheckReturnsFalseForDeniedGrant() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/internal/permissions/check")
                        .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                        .param("roleCode", "SALES")
                        .param("pageCode", "admin.employees")
                        .param("type", "VIEW"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString()).contains("\"allowed\":false");
    }

    @Test
    @DisplayName("role-form /auth/internal/permissions/check 는 내부 토큰 없으면 차단한다")
    void roleFormCheckRequiresInternalToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/internal/permissions/check")
                        .param("roleCode", "MANAGER")
                        .param("pageCode", "admin.employees")
                        .param("type", "VIEW"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(401);
    }
}
