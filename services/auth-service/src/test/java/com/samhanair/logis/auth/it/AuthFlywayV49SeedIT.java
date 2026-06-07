package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** V49 V5 개발 계정 비밀번호 해시 교정이 실 로그인 계약을 회복하는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
class AuthFlywayV49SeedIT extends AbstractPostgresIT {

    private static final String DEV_ACCOUNT_PASSWORD = "dev_p05_pass!";
    private static final List<DevAccount> DEV_ACCOUNTS = List.of(
            new DevAccount("dev_master", "MASTER", "MASTER 그룹(100)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000001")),
            new DevAccount("dev_developer", "DEVELOPER", "DEVELOPER 그룹(109)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000002")),
            new DevAccount("dev_manager", "MANAGER", "MANAGER 그룹(101)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000003")),
            new DevAccount("dev_sales", "SALES", "SALES 그룹(102)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000004")),
            new DevAccount("dev_accountant", "ACCOUNTANT", "ACCOUNTANT 그룹(104)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000005")),
            new DevAccount("dev_warehouse", "WAREHOUSE", "WAREHOUSE 그룹(103)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000006")),
            new DevAccount("dev_inventory", "INVENTORY", "INVENTORY 그룹(105)",
                    UUID.fromString("a0000000-0000-0000-0000-000000000007"))
    );

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("V49는 V5 정상 활성 개발 계정 7건의 dev_p05_pass! 로그인을 복구한다")
    void activeDevAccountsCanLoginWithRepairedV5PasswordHash() throws Exception {
        // dev_locked=잠금, dev_disabled=is_deleted seed 이므로 로그인 성공 단언 대상에서 제외한다.
        for (DevAccount account : DEV_ACCOUNTS) {
            assertCanLogin(account);
        }
    }

    private void assertCanLogin(DevAccount account) throws Exception {
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
    }

    private record DevAccount(String loginId, String expectedRole, String groupLabel, UUID accountId) {
    }
}
