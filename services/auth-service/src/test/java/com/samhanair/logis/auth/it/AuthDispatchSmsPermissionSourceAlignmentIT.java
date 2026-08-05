package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** #1013 R14: 메뉴·라우트·API가 V92 정본 page code를 실제 HTTP로 함께 보는 계약. */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
class AuthDispatchSmsPermissionSourceAlignmentIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "notification.dispatch-sms.send-audit";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("배차안내문자 실제 소비 코드도 5개 권한 정본에서 활성 grant를 남기지 않는다")
    void actualDispatchSmsPermissionSourcesAreRetired() throws Exception {
        Integer activeRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM account_page_permissions WHERE page_code = ? AND is_deleted = FALSE",
                Integer.class, PAGE_CODE);
        assertThat(activeRows).as("V92 canonical account grant").isZero();

        UUID revokedAccount = jdbcTemplate.queryForObject(
                "SELECT account_id FROM account_page_permissions "
                        + "WHERE page_code = ? AND is_deleted = TRUE AND deleted_by = 'migration:V92' "
                        + "ORDER BY account_id LIMIT 1",
                UUID.class, PAGE_CODE);

        MvcResult denied = mockMvc.perform(get("/auth/internal/permissions/check")
                        .header("X-Internal-Token", "test-internal-token")
                        .param("accountId", revokedAccount.toString())
                        .param("pageCode", PAGE_CODE)
                        .param("action", "VIEW"))
                .andReturn();
        assertThat(denied.getResponse().getStatus()).isEqualTo(200);
        assertThat(denied.getResponse().getContentAsString()).contains("\"allowed\":false");

        // V92가 기존 grant를 회수한 뒤 관리자가 새로 부여한 정상 계정 경로도 실제 HTTP로 확인한다.
        jdbcTemplate.update(
                "INSERT INTO account_page_permissions "
                        + "(account_id, page_code, can_view, can_create, created_by, is_deleted) "
                        + "VALUES (?, ?, TRUE, TRUE, 'R14-test', FALSE)",
                revokedAccount, PAGE_CODE);
        try {
            MvcResult granted = mockMvc.perform(get("/auth/internal/permissions/check")
                            .header("X-Internal-Token", "test-internal-token")
                            .param("accountId", revokedAccount.toString())
                            .param("pageCode", PAGE_CODE)
                            .param("action", "CREATE"))
                    .andReturn();
            assertThat(granted.getResponse().getStatus()).isEqualTo(200);
            assertThat(granted.getResponse().getContentAsString()).contains("\"allowed\":true");
        } finally {
            jdbcTemplate.update(
                    "DELETE FROM account_page_permissions WHERE account_id = ? AND page_code = ? "
                            + "AND created_by = 'R14-test'",
                    revokedAccount, PAGE_CODE);
        }
    }

    @Test
    @DisplayName("배차안내문자 회수와 무관한 배차 보드 권한은 남는다")
    void unrelatedDispatchBoardPermissionRemainsActive() {
        Integer activeRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM role_page_permissions "
                        + "WHERE page_code = 'dispatch.board' AND is_deleted = FALSE",
                Integer.class);
        assertThat(activeRows).as("dispatch.board active grant").isPositive();
    }
}
