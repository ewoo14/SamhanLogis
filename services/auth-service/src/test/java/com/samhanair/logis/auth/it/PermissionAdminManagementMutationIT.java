package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 관리 page-code 변경 우회 경로를 HTTP 통합 레벨에서 고정한다.
 *
 * <p>{@code system.permission-admin} 을 위임받은 비MASTER는 운영 권한 화면을 사용할 수 있지만
 * {@code PageCode.MANAGEMENT_PAGE_CODES} 자체를 role override, role template, 그룹 배속으로
 * 주입하거나 상속시킬 수 없다. MASTER 는 동일 경로를 계속 사용할 수 있어야 한다.
 */
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
class PermissionAdminManagementMutationIT extends AbstractPostgresIT {

    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID SALES_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final String TEST_ROLE = "PHASE_B_IT_ROLE";
    private static final String TEST_GROUP_NAME = "IT Phase B 관리권한 우회봉쇄";
    private static final String PAGE_PERMISSION_ADMIN = "system.permission-admin";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        cleanRows();
        lenient().when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(MANAGER_ACCOUNT_ID),
                        ArgumentMatchers.eq(PAGE_PERMISSION_ADMIN),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        cleanRows();
    }

    @Test
    @DisplayName("관리 page-code 보유 그룹 배속은 위임받은 비MASTER 403 / MASTER 200")
    void assignGroupWithManagementPageCode_requiresMasterRole() throws Exception {
        UUID groupId = createGroup();
        delegatePermissionAdmin(groupId);

        MvcResult nonMaster = mockMvc.perform(post("/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(groupId)))
                .andReturn();

        assertThat(nonMaster.getResponse().getStatus()).isEqualTo(403);
        assertAssignmentRows(groupId, 0);

        MvcResult master = mockMvc.perform(post("/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(groupId)))
                .andReturn();

        assertThat(master.getResponse().getStatus()).isEqualTo(200);
        assertAssignmentRows(groupId, 1);
    }

    @Test
    @DisplayName("role override 관리 page-code 부여는 위임받은 비MASTER 403 / MASTER 200")
    void updatePermission_managementPageCode_requiresMasterRole() throws Exception {
        MvcResult nonMaster = mockMvc.perform(put("/auth/admin/permissions")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(permissionBody(true, true)))
                .andReturn();

        assertThat(nonMaster.getResponse().getStatus()).isEqualTo(403);
        assertRoleOverrideRows(0);

        MvcResult master = mockMvc.perform(put("/auth/admin/permissions")
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(permissionBody(true, true)))
                .andReturn();

        assertThat(master.getResponse().getStatus()).isEqualTo(200);
        assertRoleOverrideRows(1);
    }

    @Test
    @DisplayName("template 관리 page-code 주입은 위임받은 비MASTER 403 / MASTER 200")
    void updateTemplate_managementPageCode_requiresMasterRole() throws Exception {
        MvcResult nonMaster = mockMvc.perform(put("/auth/admin/permissions/templates/{roleCode}", TEST_ROLE)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(templateBody(true, true)))
                .andReturn();

        assertThat(nonMaster.getResponse().getStatus()).isEqualTo(403);
        assertTemplateRows(0);

        MvcResult master = mockMvc.perform(put("/auth/admin/permissions/templates/{roleCode}", TEST_ROLE)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(templateBody(true, true)))
                .andReturn();

        assertThat(master.getResponse().getStatus()).isEqualTo(200);
        assertTemplateRows(1);
    }

    private UUID createGroup() throws Exception {
        MvcResult created = mockMvc.perform(post("/auth/admin/permission-groups")
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","description":"관리 page-code 보유 배속 테스트"}
                                """.formatted(TEST_GROUP_NAME)))
                .andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        JsonNode root = objectMapper.readTree(created.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return UUID.fromString(root.path("data").path("id").asText());
    }

    private void delegatePermissionAdmin(UUID groupId) throws Exception {
        MvcResult delegated = mockMvc.perform(put("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"permissionAdmin":true,"hrRoleManagement":false,"permissionGroups":false}
                                """))
                .andReturn();
        assertThat(delegated.getResponse().getStatus()).isEqualTo(200);
    }

    private String permissionBody(boolean view, boolean edit) {
        return """
                {"roleCode":"%s","pageCode":"%s","canView":%s,"canEdit":%s}
                """.formatted(TEST_ROLE, PAGE_PERMISSION_ADMIN, view, edit);
    }

    private String templateBody(boolean view, boolean update) {
        return """
                [{"pageCode":"%s","actions":{
                  "view":%s,"create":false,"update":%s,"delete":false,
                  "restore":false,"download":false,"print":false
                }}]
                """.formatted(PAGE_PERMISSION_ADMIN, view, update);
    }

    private void assertAssignmentRows(UUID groupId, int expected) {
        Integer rows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_groups
                WHERE account_id = ?
                  AND group_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, SALES_ACCOUNT_ID, groupId);
        assertThat(rows).isEqualTo(expected);
    }

    private void assertRoleOverrideRows(int expected) {
        Integer rows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM role_page_permissions
                WHERE role_code = ?
                  AND page_code = ?
                  AND is_deleted = FALSE
                """, Integer.class, TEST_ROLE, PAGE_PERMISSION_ADMIN);
        assertThat(rows).isEqualTo(expected);
    }

    private void assertTemplateRows(int expected) {
        Integer rows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM role_page_permission_templates
                WHERE role_code = ?
                  AND page_code = ?
                """, Integer.class, TEST_ROLE, PAGE_PERMISSION_ADMIN);
        assertThat(rows).isEqualTo(expected);
    }

    private void cleanRows() {
        jdbcTemplate.update("""
                DELETE FROM account_groups ag
                USING permission_groups pg
                WHERE ag.group_id = pg.id
                  AND pg.name = ?
                """, TEST_GROUP_NAME);
        jdbcTemplate.update("""
                DELETE FROM group_page_permissions gpp
                USING permission_groups pg
                WHERE gpp.group_id = pg.id
                  AND pg.name = ?
                """, TEST_GROUP_NAME);
        jdbcTemplate.update("""
                DELETE FROM permission_groups
                WHERE name = ?
                """, TEST_GROUP_NAME);
        jdbcTemplate.update("""
                DELETE FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = ?
                """, SALES_ACCOUNT_ID, PAGE_PERMISSION_ADMIN);
        jdbcTemplate.update("""
                DELETE FROM role_page_permissions
                WHERE role_code = ?
                  AND page_code = ?
                """, TEST_ROLE, PAGE_PERMISSION_ADMIN);
        jdbcTemplate.update("""
                DELETE FROM role_page_permission_templates
                WHERE role_code = ?
                  AND page_code = ?
                """, TEST_ROLE, PAGE_PERMISSION_ADMIN);
    }
}
