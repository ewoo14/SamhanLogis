package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.samhanair.logis.auth.domain.RolePagePermission;
import com.samhanair.logis.auth.repository.RolePagePermissionRepository;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PermissionInternalControllerTest {

    private AccountPermissionService accountPermissionService;
    private DynamicPermissionService dynamicPermissionService;
    private RolePagePermissionRepository rolePagePermissionRepository;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        accountPermissionService = Mockito.mock(AccountPermissionService.class);
        dynamicPermissionService = Mockito.mock(DynamicPermissionService.class);
        rolePagePermissionRepository = Mockito.mock(RolePagePermissionRepository.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PermissionInternalController(
                        accountPermissionService, dynamicPermissionService, rolePagePermissionRepository))
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

    /** role-form type=EDIT 가 can_edit grant 로 매핑되는지 회귀 가드 (action=UPDATE 와 동치 경로). */
    @Test
    void checkPermissionMapsRoleTypeEditToEditPermissionType() throws Exception {
        given(dynamicPermissionService.canAccess("MANAGER", "admin.employees", "EDIT"))
                .willReturn(true);

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/check")
                                .param("roleCode", "MANAGER")
                                .param("pageCode", "admin.employees")
                                .param("type", "EDIT"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("\"allowed\":true");
    }

    /**
     * role-form 계약 가드 회귀: roleCode 만 있고 type·action 모두 누락 시 400.
     *
     * <p>구버전은 type 에 defaultValue="EDIT" 가 있어 누락 시 EDIT 로 폴백했으나,
     * 현재는 type·action 모두 optional 이고 동시 누락 시 명시적으로 BAD_REQUEST 를 반환한다
     * ({@code resolveRolePermissionType}). default 복원/분기 변경 회귀를 잡기 위한 가드.
     */
    @Test
    void checkPermissionRejectsRoleFormWithoutTypeAndAction() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/check")
                                .param("roleCode", "MANAGER")
                                .param("pageCode", "admin.employees"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        Mockito.verifyNoInteractions(dynamicPermissionService);
    }

    /**
     * role-matrix 는 pagePrefix 로 시작하는 활성 grant 행만 매트릭스로 반환하며,
     * 행마다 getPermission 재조회 없이(N+1 제거) 로드한 row 의 can_view/can_edit 로 DTO 를 구성한다.
     */
    @Test
    void roleMatrixReturnsOnlyRowsMatchingPrefix() throws Exception {
        RolePagePermission arologisRow = Mockito.mock(RolePagePermission.class);
        Mockito.when(arologisRow.getRoleCode()).thenReturn("MASTER");
        Mockito.when(arologisRow.getPageCode()).thenReturn("arologis.admin.permissions");
        Mockito.when(arologisRow.isCanView()).thenReturn(true);
        Mockito.when(arologisRow.isCanEdit()).thenReturn(true);
        RolePagePermission otherRow = Mockito.mock(RolePagePermission.class);
        Mockito.when(otherRow.getRoleCode()).thenReturn("ACCOUNTANT");
        Mockito.when(otherRow.getPageCode()).thenReturn("accounting.journals");
        Mockito.when(rolePagePermissionRepository.findAllOrderByRoleCodeAndPageCode())
                .thenReturn(List.of(arologisRow, otherRow));

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/role-matrix")
                                .param("pagePrefix", "arologis."))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("arologis.admin.permissions", "MASTER");
        // 행 row 기반으로 canView/canEdit/isOverride 를 직접 구성 (getPermission 미사용).
        assertThat(response.getContentAsString()).contains("\"canEdit\":true", "\"isOverride\":true");
        assertThat(response.getContentAsString()).doesNotContain("accounting.journals");
        // N+1 제거 — 매트릭스 구성에 getPermission(DynamicPermissionService) 를 호출하지 않는다.
        Mockito.verifyNoInteractions(dynamicPermissionService);
    }

    /** role-matrix 는 pagePrefix blank 시 400 으로 거부한다(전체 매트릭스 유출 차단). */
    @Test
    void roleMatrixRejectsBlankPrefix() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/internal/permissions/role-matrix")
                                .param("pagePrefix", "  "))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        Mockito.verifyNoInteractions(rolePagePermissionRepository);
    }

    /** role-grant 는 DynamicPermissionService.updatePermission 으로 upsert 위임한다. */
    @Test
    void roleGrantDelegatesUpsert() throws Exception {
        Mockito.when(dynamicPermissionService.updatePermission(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString()))
                .thenReturn(new PermissionDto("MANAGER", "arologis.region",
                        "아로로지스 지역/구역 관리", true, true, true));

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.put("/auth/internal/permissions/role-grant")
                                .header("X-User-Id", "tester")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"roleCode\":\"MANAGER\",\"pageCode\":\"arologis.region\","
                                        + "\"canView\":true,\"canEdit\":true}"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("\"canEdit\":true", "arologis.region");
        Mockito.verify(dynamicPermissionService)
                .updatePermission(ArgumentMatchers.any(), ArgumentMatchers.eq("tester"));
    }

    @Test
    void roleGrant_log_hides_uuid_but_service_receives_original_actor_id() throws Exception {
        String actorId = "cafebabe-cafe-babe-cafe-babecafebabe";
        Mockito.when(dynamicPermissionService.updatePermission(
                        ArgumentMatchers.any(), ArgumentMatchers.eq(actorId)))
                .thenReturn(new PermissionDto("MANAGER", "arologis.region",
                        "아로로지스 지역/구역 관리", true, true, true));
        Logger logger = (Logger) LoggerFactory.getLogger(PermissionInternalController.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            MockHttpServletResponse response = mockMvc.perform(
                            MockMvcRequestBuilders.put("/auth/internal/permissions/role-grant")
                                    .header("X-User-Id", actorId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"roleCode\":\"MANAGER\",\"pageCode\":\"arologis.region\","
                                            + "\"canView\":true,\"canEdit\":true}"))
                    .andReturn().getResponse();

            assertThat(response.getStatus()).isEqualTo(200);
        } finally {
            logger.detachAppender(appender);
        }

        assertThat(appender.list)
                .anySatisfy(event -> assertThat(event.getFormattedMessage())
                        .contains("변경자 미상")
                        .doesNotContain(actorId));
        Mockito.verify(dynamicPermissionService)
                .updatePermission(ArgumentMatchers.any(), ArgumentMatchers.eq(actorId));
    }
}
