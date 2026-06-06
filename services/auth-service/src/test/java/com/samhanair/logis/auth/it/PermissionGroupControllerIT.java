package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.EffectivePermissionMaterializer;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
 * PermissionGroupController 실 HTTP + 실 DB 통합 테스트.
 *
 * <p>서비스 계층은 mock 하지 않고, {@link DynamicPermissionClient} 만 격리한다.
 * 따라서 controller → service → JPA → PostgreSQL → materializer 경로를 실제로 검증한다.
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
class PermissionGroupControllerIT extends AbstractPostgresIT {

    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID SALES_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final UUID MASTER_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000100");
    private static final String PAGE = "admin.permission-groups";
    private static final String PAGE_PERMISSION_ADMIN = "system.permission-admin";
    private static final String PAGE_ROLE_MANAGEMENT = "hr.role-management";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EffectivePermissionMaterializer materializer;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        cleanPermissionGroupTestRows();
        cleanAccountRows();
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(MANAGER_ACCOUNT_ID),
                ArgumentMatchers.eq("system.permission-admin"),
                ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(MANAGER_ACCOUNT_ID),
                ArgumentMatchers.eq("system.permission-admin"),
                ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);
    }

    @AfterEach
    void tearDown() {
        cleanPermissionGroupTestRows();
        cleanAccountRows();
        materializer.materializeForAccount(SALES_ACCOUNT_ID);
    }

    @Test
    @DisplayName("권한그룹 목록 가드 — MASTER bypass 200 / non-MASTER deny 403")
    void listGroups_guard() throws Exception {
        MvcResult master = mockMvc.perform(get("/auth/admin/permission-groups")
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();

        assertThat(master.getResponse().getStatus()).isEqualTo(200);
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));

        MvcResult manager = mockMvc.perform(get("/auth/admin/permission-groups")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER"))
                .andReturn();

        assertThat(manager.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("그룹 CRUD — 생성/중복409/개명/빈 그룹 삭제")
    void groupCrud_endToEnd() throws Exception {
        UUID groupId = createGroup("IT 권한그룹 CRUD", "초기 설명");

        MvcResult duplicate = mockMvc.perform(post("/auth/admin/permission-groups")
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"IT 권한그룹 CRUD","description":"중복"}
                                """))
                .andReturn();
        assertThat(duplicate.getResponse().getStatus()).isEqualTo(409);

        MvcResult renamed = mockMvc.perform(put("/auth/admin/permission-groups/{id}", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"IT 권한그룹 CRUD 변경","description":"변경 설명"}
                                """))
                .andReturn();
        assertThat(renamed.getResponse().getStatus()).isEqualTo(200);

        assertThat(jdbcTemplate.queryForObject("""
                SELECT name
                FROM permission_groups
                WHERE id = ?
                  AND is_deleted = FALSE
                """, String.class, groupId)).isEqualTo("IT 권한그룹 CRUD 변경");

        MvcResult deleted = mockMvc.perform(delete("/auth/admin/permission-groups/{id}", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(deleted.getResponse().getStatus()).isEqualTo(204);

        Integer activeRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM permission_groups
                WHERE id = ?
                  AND is_deleted = FALSE
                """, Integer.class, groupId);
        assertThat(activeRows).isZero();
    }

    @Test
    @DisplayName("삭제 차단 — MASTER 빌트인 그룹과 배속 계정 보유 그룹은 409")
    void deleteGuards_return409() throws Exception {
        MvcResult builtin = mockMvc.perform(delete("/auth/admin/permission-groups/{id}", MASTER_GROUP_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(builtin.getResponse().getStatus()).isEqualTo(409);

        UUID groupId = createGroup("IT 권한그룹 배속삭제차단", "배속 보유");
        assignGroup(SALES_ACCOUNT_ID, groupId);

        MvcResult assigned = mockMvc.perform(delete("/auth/admin/permission-groups/{id}", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(assigned.getResponse().getStatus()).isEqualTo(409);

        Integer activeAssignments = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_groups
                WHERE account_id = ?
                  AND group_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, SALES_ACCOUNT_ID, groupId);
        assertThat(activeAssignments).isEqualTo(1);
    }

    @Test
    @DisplayName("배속 차단 — MASTER 시스템 권한그룹에는 계정을 직접 배속할 수 없다")
    void assignMasterSystemGroup_returns409() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(MASTER_GROUP_ID)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("시스템 권한그룹");

        Integer activeAssignments = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_groups
                WHERE account_id = ?
                  AND group_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, SALES_ACCOUNT_ID, MASTER_GROUP_ID);
        assertThat(activeAssignments).isZero();
    }

    @Test
    @DisplayName("매트릭스 차단 — MASTER 시스템 권한그룹 권한 매트릭스는 편집할 수 없다")
    void updateMasterSystemGroupMatrix_returns409() throws Exception {
        MvcResult result = mockMvc.perform(put("/auth/admin/permission-groups/{id}/permissions", MASTER_GROUP_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rows":[{"pageCode":"%s","actions":{
                                  "view":true,"create":false,"update":true,"delete":false,
                                  "restore":false,"download":false,"print":false
                                }}]}
                                """.formatted(PAGE)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("시스템 권한그룹");
    }

    @Test
    @DisplayName("그룹 매트릭스/배속/override — 갱신 후 effective 반영, override deny 우선")
    void matrixAssignAndOverride_endToEnd() throws Exception {
        UUID groupId = createGroup("IT 권한그룹 매트릭스", "권한 재계산");
        updateGroupMatrix(groupId, true, true);
        assignGroup(SALES_ACCOUNT_ID, groupId);

        assertEffective(SALES_ACCOUNT_ID, PAGE, true, true);

        MvcResult groups = mockMvc.perform(get("/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(groups.getResponse().getStatus()).isEqualTo(200);
        assertThat(groups.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("IT 권한그룹 매트릭스");
        assertThat(groups.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("[DEV-SEED] 개발영업");

        overrideAccountPermission(SALES_ACCOUNT_ID, false, false);
        assertEffective(SALES_ACCOUNT_ID, PAGE, false, false);

        updateGroupMatrix(groupId, true, true);
        assertEffective(SALES_ACCOUNT_ID, PAGE, false, false);

        MvcResult unassigned = mockMvc.perform(delete(
                        "/auth/admin/accounts/{accountId}/groups/{groupId}", SALES_ACCOUNT_ID, groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(unassigned.getResponse().getStatus()).isEqualTo(204);
        assertEffective(SALES_ACCOUNT_ID, PAGE, false, false);
    }

    @Test
    @DisplayName("관리 page-code 봉쇄 — 위임받은 비MASTER 는 관리권위를 재부여할 수 없고 MASTER 만 허용")
    void managementPageCodeGrant_requiresMasterRole() throws Exception {
        UUID groupId = createGroup("IT 권한그룹 위임봉쇄", "관리권위 grant 봉쇄");
        lenient().when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(MANAGER_ACCOUNT_ID),
                        ArgumentMatchers.eq(PAGE_PERMISSION_ADMIN),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(true);

        MvcResult nonMasterAccountGrant = mockMvc.perform(put(
                        "/auth/admin/permissions/account/{accountId}", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(managementAccountGrantBody(PAGE_ROLE_MANAGEMENT, true)))
                .andReturn();
        assertThat(nonMasterAccountGrant.getResponse().getStatus()).isEqualTo(403);

        MvcResult nonMasterGroupGrant = mockMvc.perform(put(
                        "/auth/admin/permission-groups/{id}/permissions", groupId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupMatrixBody(PAGE_ROLE_MANAGEMENT, true, true)))
                .andReturn();
        assertThat(nonMasterGroupGrant.getResponse().getStatus()).isEqualTo(403);

        MvcResult masterAccountGrant = mockMvc.perform(put(
                        "/auth/admin/permissions/account/{accountId}", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(managementAccountGrantBody(PAGE_ROLE_MANAGEMENT, true)))
                .andReturn();
        assertThat(masterAccountGrant.getResponse().getStatus()).isEqualTo(200);

        MvcResult masterGroupGrant = mockMvc.perform(put(
                        "/auth/admin/permission-groups/{id}/permissions", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupMatrixBody(PAGE_ROLE_MANAGEMENT, true, true)))
                .andReturn();
        assertThat(masterGroupGrant.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("권한 위임 API — MASTER 가 그룹 관리권위를 부여/회수하고 materialize 한다")
    void delegationEndpoint_grantsAndRevokesManagementPages() throws Exception {
        UUID groupId = createGroup("IT 권한그룹 위임API", "관리권위 위임");
        assignGroup(SALES_ACCOUNT_ID, groupId);
        lenient().when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(MANAGER_ACCOUNT_ID),
                        ArgumentMatchers.eq(PAGE_PERMISSION_ADMIN),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(true);

        MvcResult denied = mockMvc.perform(put("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"permissionAdmin":true,"hrRoleManagement":true,"permissionGroups":true}
                                """))
                .andReturn();
        assertThat(denied.getResponse().getStatus()).isEqualTo(403);

        MvcResult granted = mockMvc.perform(put("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"permissionAdmin":false,"hrRoleManagement":true,"permissionGroups":false}
                                """))
                .andReturn();
        assertThat(granted.getResponse().getStatus()).isEqualTo(200);
        assertThat(granted.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"hrRoleManagement\":true");
        assertThat(activeGroupPagePermissionCount(groupId, PAGE_ROLE_MANAGEMENT)).isEqualTo(1);
        assertEffective(SALES_ACCOUNT_ID, PAGE_ROLE_MANAGEMENT, true, true);

        MvcResult nonMasterAssignGrantedGroup = mockMvc.perform(post(
                        "/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(groupId)))
                .andReturn();
        assertThat(nonMasterAssignGrantedGroup.getResponse().getStatus()).isEqualTo(403);

        MvcResult current = mockMvc.perform(get("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(current.getResponse().getStatus()).isEqualTo(200);
        assertThat(current.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"permissionAdmin\":false", "\"hrRoleManagement\":true", "\"permissionGroups\":false");

        MvcResult revoked = mockMvc.perform(put("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"permissionAdmin":false,"hrRoleManagement":false,"permissionGroups":false}
                                """))
                .andReturn();
        assertThat(revoked.getResponse().getStatus()).isEqualTo(200);
        assertEffective(SALES_ACCOUNT_ID, PAGE_ROLE_MANAGEMENT, false, false);
        assertThat(activeGroupPagePermissionCount(groupId, PAGE_ROLE_MANAGEMENT)).isZero();
        assertThat(revoked.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"hrRoleManagement\":false");

        MvcResult revokedCurrent = mockMvc.perform(get("/auth/admin/permission-groups/{id}/delegations", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(revokedCurrent.getResponse().getStatus()).isEqualTo(200);
        assertThat(revokedCurrent.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"hrRoleManagement\":false");

        MvcResult unassignedAfterRevoke = mockMvc.perform(delete(
                        "/auth/admin/accounts/{accountId}/groups/{groupId}", SALES_ACCOUNT_ID, groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andReturn();
        assertThat(unassignedAfterRevoke.getResponse().getStatus()).isEqualTo(204);

        MvcResult nonMasterAssignRevokedGroup = mockMvc.perform(post(
                        "/auth/admin/accounts/{accountId}/groups", SALES_ACCOUNT_ID)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(groupId)))
                .andReturn();
        assertThat(nonMasterAssignRevokedGroup.getResponse().getStatus()).isEqualTo(200);
    }

    private UUID createGroup(String name, String description) throws Exception {
        MvcResult created = mockMvc.perform(post("/auth/admin/permission-groups")
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","description":"%s"}
                """.formatted(name, description)))
                .andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        JsonNode root = objectMapper.readTree(created.getResponse().getContentAsString(StandardCharsets.UTF_8));
        UUID groupId = UUID.fromString(root.path("data").path("id").asText());
        assertThat(root.path("data").path("name").asText()).isEqualTo(name);
        return groupId;
    }

    private void assignGroup(UUID accountId, UUID groupId) throws Exception {
        MvcResult assigned = mockMvc.perform(post("/auth/admin/accounts/{accountId}/groups", accountId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"groupId":"%s"}
                                """.formatted(groupId)))
                .andReturn();
        assertThat(assigned.getResponse().getStatus()).isEqualTo(200);
        assertThat(assigned.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains(groupId.toString());
    }

    private void updateGroupMatrix(UUID groupId, boolean view, boolean update) throws Exception {
        MvcResult result = mockMvc.perform(put("/auth/admin/permission-groups/{id}/permissions", groupId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupMatrixBody(PAGE, view, update)))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    private void overrideAccountPermission(UUID accountId, boolean view, boolean update) throws Exception {
        MvcResult result = mockMvc.perform(put("/auth/admin/permissions/account/{accountId}", accountId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MASTER")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(managementAccountGrantBody(PAGE, view)))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    private String managementAccountGrantBody(String page, boolean grant) {
        return """
                [{"pageCode":"%s","actions":{
                  "view":%s,"create":false,"update":%s,"delete":false,
                  "restore":false,"download":false,"print":false
                }}]
                """.formatted(page, grant, grant);
    }

    private String groupMatrixBody(String page, boolean view, boolean update) {
        return """
                {"rows":[{"pageCode":"%s","actions":{
                  "view":%s,"create":false,"update":%s,"delete":false,
                  "restore":false,"download":false,"print":false
                }}]}
                """.formatted(page, view, update);
    }

    private void assertEffective(UUID accountId, String pageCode, boolean view, boolean update) {
        List<MapRow> rows = jdbcTemplate.query("""
                SELECT can_view, can_update
                FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = ?
                  AND is_deleted = FALSE
                """, (rs, rowNum) -> new MapRow(rs.getBoolean("can_view"), rs.getBoolean("can_update")),
                accountId, pageCode);
        MapRow row = rows.isEmpty() ? new MapRow(false, false) : rows.get(0);
        assertThat(row.canView()).isEqualTo(view);
        assertThat(row.canUpdate()).isEqualTo(update);
    }

    private int activeGroupPagePermissionCount(UUID groupId, String pageCode) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM group_page_permissions
                WHERE group_id = ?
                  AND page_code = ?
                  AND is_deleted = FALSE
                """, Integer.class, groupId, pageCode);
    }

    private void cleanPermissionGroupTestRows() {
        jdbcTemplate.update("""
                DELETE FROM account_groups ag
                USING permission_groups pg
                WHERE ag.group_id = pg.id
                  AND pg.name LIKE 'IT 권한그룹%'
                """);
        jdbcTemplate.update("""
                DELETE FROM group_page_permissions gpp
                USING permission_groups pg
                WHERE gpp.group_id = pg.id
                  AND pg.name LIKE 'IT 권한그룹%'
                """);
        jdbcTemplate.update("""
                DELETE FROM permission_groups
                WHERE name LIKE 'IT 권한그룹%'
                """);
    }

    private void cleanAccountRows() {
        jdbcTemplate.update("""
                DELETE FROM account_groups
                WHERE account_id = ?
                  AND group_id = ?
                """, SALES_ACCOUNT_ID, MASTER_GROUP_ID);
        jdbcTemplate.update("""
                DELETE FROM account_permission_overrides
                WHERE account_id = ?
                  AND page_code IN (?, ?)
                """, SALES_ACCOUNT_ID, PAGE, PAGE_ROLE_MANAGEMENT);
        jdbcTemplate.update("""
                DELETE FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code IN (?, ?)
                """, SALES_ACCOUNT_ID, PAGE, PAGE_ROLE_MANAGEMENT);
    }

    private record MapRow(boolean canView, boolean canUpdate) {
    }
}
