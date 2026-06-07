package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** V48 개발 계정 seed 가 로그인과 deny 권한 조회 계약을 동시에 만족하는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
class AuthFlywayV48SeedIT extends AbstractPostgresIT {

    private static final UUID DEV_DRIVER_ID =
            UUID.fromString("b0000000-0000-0000-0000-00000000000a");
    private static final String DEV_DRIVER_PASSWORD = "dev_p05_pass!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("V48 dev_driver는 즉시 로그인 가능하고 products.list VIEW 권한은 없다")
    void devDriverCanLoginAndProductsListViewIsDenied() throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "loginId": "dev_driver",
                                  "password": "%s"
                                }
                                """.formatted(DEV_DRIVER_PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode loginData = objectMapper.readTree(loginResult.getResponse().getContentAsString()).get("data");
        assertThat(loginData.path("token").asText()).isNotBlank();
        assertThat(loginData.path("userId").asText()).isEqualTo(DEV_DRIVER_ID.toString());
        assertThat(loginData.path("role").asText()).isEqualTo("DRIVER");
        assertThat(passwordChangeRequired(DEV_DRIVER_ID)).isFalse();

        MvcResult permissionsResult = mockMvc.perform(get("/auth/admin/permissions/my")
                        .header("X-User-Id", DEV_DRIVER_ID.toString()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode permissions = objectMapper.readTree(permissionsResult.getResponse().getContentAsString()).get("data");
        JsonNode productsListActions = permissions.get("products.list");
        assertThat(productsListActions)
                .as("V48 materialize 는 DRIVER products.list FALSE row 를 빈 action 배열로 반환해야 한다")
                .isNotNull();
        assertThat(productsListActions).extracting(JsonNode::asText).doesNotContain("VIEW");
        assertThat(productsListCanView(DEV_DRIVER_ID)).isFalse();
    }

    private Boolean passwordChangeRequired(UUID accountId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT password_change_required
                  FROM accounts
                 WHERE id = ?::uuid
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                accountId.toString());
    }

    private Boolean productsListCanView(UUID accountId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT can_view
                  FROM account_page_permissions
                 WHERE account_id = ?::uuid
                   AND page_code = 'products.list'
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                accountId.toString());
    }
}
