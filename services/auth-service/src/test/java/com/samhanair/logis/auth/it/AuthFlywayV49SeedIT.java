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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** V49 V5 개발 계정 비밀번호 해시 교정이 실 로그인 계약을 회복하는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
class AuthFlywayV49SeedIT extends AbstractPostgresIT {

    private static final String DEV_ACCOUNT_PASSWORD = requireDevPassword();

    private static String requireDevPassword() {
        String password = System.getenv("QA_DEV_DEFAULT_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("QA_DEV_DEFAULT_PASSWORD 환경변수가 필요합니다.");
        }
        return password;
    }
    private static final String REPAIRED_PASSWORD_HASH =
            "$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y";
    private static final String LEGACY_DEFECT_PASSWORD_HASH =
            "$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu";
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
    private static final List<V5PasswordPolicy> V5_PASSWORD_POLICIES = List.of(
            new V5PasswordPolicy("dev_master", UUID.fromString("a0000000-0000-0000-0000-000000000001"), true),
            new V5PasswordPolicy("dev_developer", UUID.fromString("a0000000-0000-0000-0000-000000000002"), true),
            new V5PasswordPolicy("dev_manager", UUID.fromString("a0000000-0000-0000-0000-000000000003"), true),
            new V5PasswordPolicy("dev_sales", UUID.fromString("a0000000-0000-0000-0000-000000000004"), true),
            new V5PasswordPolicy("dev_accountant", UUID.fromString("a0000000-0000-0000-0000-000000000005"), true),
            new V5PasswordPolicy("dev_warehouse", UUID.fromString("a0000000-0000-0000-0000-000000000006"), true),
            new V5PasswordPolicy("dev_inventory", UUID.fromString("a0000000-0000-0000-0000-000000000007"), true),
            new V5PasswordPolicy("dev_locked", UUID.fromString("a0000000-0000-0000-0000-000000000008"), false),
            new V5PasswordPolicy("dev_disabled", UUID.fromString("a0000000-0000-0000-0000-000000000009"), false)
    );

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("V49는 V5 정상 활성 개발 계정 7건의 QA_DEV_DEFAULT_PASSWORD 로그인을 복구한다")
    void activeDevAccountsCanLoginWithRepairedV5PasswordHash() throws Exception {
        // dev_locked=잠금, dev_disabled=is_deleted seed 이므로 로그인 성공 단언 대상에서 제외한다.
        for (DevAccount account : DEV_ACCOUNTS) {
            assertCanLogin(account);
        }
    }

    @Test
    @DisplayName("V49는 V5 개발 계정 9건의 해시를 교정하고 V5 정책 플래그를 보존한다")
    void repairedHashAndPasswordPolicyArePersistedForAllV5DevAccounts() {
        assertThat(passwordHashCount(REPAIRED_PASSWORD_HASH))
                .as("V5 고정 UUID 9건 전체가 QA_DEV_DEFAULT_PASSWORD 검증 해시로 교정되어야 한다")
                .isEqualTo(9L);
        assertThat(passwordHashCount(LEGACY_DEFECT_PASSWORD_HASH))
                .as("V5 고정 UUID 9건에 기존 결함 해시가 잔존하면 안 된다")
                .isZero();

        for (V5PasswordPolicy policy : V5_PASSWORD_POLICIES) {
            assertThat(passwordChangeRequired(policy.accountId()))
                    .as("%s password_change_required V5 seed 저장값 검증".formatted(policy.loginId()))
                    .isEqualTo(policy.passwordChangeRequired());
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

    private Long passwordHashCount(String passwordHash) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM accounts
                 WHERE id IN (
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid,
                       ?::uuid
                   )
                   AND password_hash = ?
                """,
                Long.class,
                v5AccountIdArgs(passwordHash));
    }

    private Object[] v5AccountIdArgs(String passwordHash) {
        Object[] args = new Object[V5_PASSWORD_POLICIES.size() + 1];
        for (int i = 0; i < V5_PASSWORD_POLICIES.size(); i++) {
            args[i] = V5_PASSWORD_POLICIES.get(i).accountId().toString();
        }
        args[V5_PASSWORD_POLICIES.size()] = passwordHash;
        return args;
    }

    private Boolean passwordChangeRequired(UUID accountId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT password_change_required
                  FROM accounts
                 WHERE id = ?::uuid
                """,
                Boolean.class,
                accountId.toString());
    }

    private record DevAccount(String loginId, String expectedRole, String groupLabel, UUID accountId) {
    }

    private record V5PasswordPolicy(String loginId, UUID accountId, boolean passwordChangeRequired) {
    }
}
