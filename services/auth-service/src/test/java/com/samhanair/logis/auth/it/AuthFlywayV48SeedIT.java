package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
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

/**
 * V48 개발 계정 seed 가 로그인과 deny 권한 조회 계약을 동시에 만족하는지 검증한다.
 *
 * <p>{@code password_change_required = FALSE} 단언은 seed 저장값 검증이다.
 * 현행 {@code AuthService.login} 은 해당 플래그로 로그인 플로우를 차단하지 않는다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
class AuthFlywayV48SeedIT extends AbstractPostgresIT {

    private static final String DEV_ACCOUNT_PASSWORD = requireDevPassword();

    private static String requireDevPassword() {
        String password = System.getenv("QA_DEV_DEFAULT_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("QA_DEV_DEFAULT_PASSWORD 환경변수가 필요합니다.");
        }
        return password;
    }
    private static final List<DevAccount> DEV_ACCOUNTS = List.of(
            new DevAccount("dev_driver", "DRIVER", "DRIVER 그룹(107)",
                    UUID.fromString("b0000000-0000-0000-0000-00000000000a")),
            new DevAccount("dev_staff", "STAFF", "STAFF 그룹(108)",
                    UUID.fromString("b0000000-0000-0000-0000-00000000000b")),
            new DevAccount("dev_dispatch", "DISPATCH", "DISPATCH 그룹(106)",
                    UUID.fromString("b0000000-0000-0000-0000-00000000000c"))
    );

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("V48 DRIVER/STAFF/DISPATCH 개발 계정은 로그인 가능하고 products.list VIEW 권한은 없다")
    void devAccountsCanLoginAndProductsListViewIsDenied() throws Exception {
        for (DevAccount account : DEV_ACCOUNTS) {
            assertCanLoginAndProductsListViewDenied(account);
        }
    }

    private void assertCanLoginAndProductsListViewDenied(DevAccount account) throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "loginId": "%s",
                                  "password": "%s"
                                }
                                """.formatted(account.loginId(), DEV_ACCOUNT_PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode loginData = objectMapper.readTree(loginResult.getResponse().getContentAsString()).get("data");
        assertThat(loginData.path("token").asText()).isNotBlank();
        assertThat(loginData.path("userId").asText()).isEqualTo(account.accountId().toString());
        assertThat(loginData.path("role").asText())
                .as("%s 배속 역매핑 확인".formatted(account.groupLabel()))
                .isEqualTo(account.expectedRole());
        assertThat(passwordChangeRequired(account.accountId()))
                .as("%s password_change_required seed 저장값 검증(login 플로우 차단과 무관)"
                        .formatted(account.loginId()))
                .isFalse();

        MvcResult permissionsResult = mockMvc.perform(get("/auth/admin/permissions/my")
                        .header("X-User-Id", account.accountId().toString()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode permissions = objectMapper.readTree(permissionsResult.getResponse().getContentAsString()).get("data");
        JsonNode productsListActions = permissions.get("products.list");
        assertThat(productsListActions)
                .as("V48 materialize 누락 확인: %s products.list FALSE row 가 빈 action 배열로 내려와야 한다"
                        .formatted(account.loginId()))
                .isNotNull();
        assertThat(productsListActions).extracting(JsonNode::asText).doesNotContain("VIEW");
        assertThat(productsListCanView(account.accountId())).isFalse();
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

    private record DevAccount(String loginId, String expectedRole, String groupLabel, UUID accountId) {
    }
}
