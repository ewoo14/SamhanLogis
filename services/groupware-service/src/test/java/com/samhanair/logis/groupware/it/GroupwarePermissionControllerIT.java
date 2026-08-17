package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.config.HeaderAuthenticationFilter;
import com.samhanair.logis.groupware.controller.GroupwareAdminController;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.dto.ApprovalDecisionRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.MessageBulkSendResponse;
import com.samhanair.logis.groupware.dto.MessageResponse;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.groupware.service.MessageService;
import com.samhanair.logis.groupware.service.ScheduleService;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.InternalSecurityAutoConfiguration;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** SP-D6-2 groupware-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = GroupwareAdminController.class,
        properties = {
                "spring.application.name=groupware-service",
                "samhan.security.department.enabled=true"
        })
@Import({
        GroupwarePermissionControllerIT.TestSecurityConfig.class,
        GroupwarePermissionControllerIT.TestMeterConfig.class,
        PermissionSecurityAutoConfiguration.class,
        InternalSecurityAutoConfiguration.class
})
class GroupwarePermissionControllerIT {

    private static final String SERVICE_NAME = "groupware-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_HEADER = "X-User-Department";
    private static final String ADMIN_PAGE = "messenger.admin";
    private static final String APPROVAL_PAGE = "groupware.approvals";
    private static final String SEND_PAGE = "messenger.send";
    private static final String SCHEDULE_PAGE = "groupware.schedules";

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ApprovalLineService approvalLineService;
    @MockBean private MessageService messageService;
    @MockBean private ScheduleService scheduleService;
    @MockBean private UserClient userClient;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        ApprovalLine approval = ApprovalLine.open(
                "2099/01/01-1", UUID.randomUUID(), "SP-D6-2 결재", "테스트");
        approval.appendStep(UUID.randomUUID());
        Message message = Message.send(UUID.randomUUID(), UUID.randomUUID(), "테스트 메시지");
        Schedule schedule = Schedule.create(
                UUID.randomUUID(),
                "테스트 일정",
                "본문",
                LocalDateTime.of(2026, 5, 26, 9, 0),
                LocalDateTime.of(2026, 5, 26, 10, 0),
                null);

        // P1-2 fix: 컨트롤러는 createWithActor / approve(3-arg) / reject(4-arg) 를 호출한다.
        lenient().when(approvalLineService.createWithActor(any(), any())).thenReturn(approval);
        lenient().when(approvalLineService.approve(any(UUID.class), any(UUID.class), any(java.util.Set.class))).thenReturn(approval);
        lenient().when(approvalLineService.reject(any(UUID.class), any(UUID.class), any(java.util.Set.class), any())).thenReturn(approval);
        lenient().when(messageService.send(any(), any(UUID.class))).thenReturn(message);
        lenient().when(messageService.inboxPageResponses(any(), any())).thenReturn(
                new org.springframework.data.domain.PageImpl<>(List.of(MessageResponse.from(message))));
        lenient().when(messageService.markRead(any(UUID.class), any(UUID.class))).thenReturn(message);
        lenient().when(messageService.sendBulk(any(), any(UUID.class))).thenReturn(
                new MessageBulkSendResponse(1, List.of(MessageResponse.from(message))));
        lenient().when(scheduleService.create(any(), any(UUID.class))).thenReturn(schedule);
        lenient().when(scheduleService.findInRange(any(), any(), any())).thenReturn(List.of(schedule));
        lenient().when(scheduleService.findVisibleById(any(), any(UUID.class))).thenReturn(schedule);
        lenient().when(scheduleService.update(any(), any(), any(UUID.class))).thenReturn(schedule);
        lenient().when(userClient.search(anyString(), anyInt())).thenReturn(List.of());
        lenient().when(userClient.search(anyString(), anyInt(), anyBoolean())).thenReturn(List.of());
    }

    @ParameterizedTest(name = "{0} grant -> 2xx")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_returns2xx(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is2xxSuccessful());
    }

    @ParameterizedTest(name = "{0} deny -> 403 + counter")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "{0} executive office + grant -> 2xx")
    @MethodSource("approvalEndpoints")
    void approvalEndpoint_executiveOfficeWithMessengerAdminGrant_returns2xx(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().is2xxSuccessful());
    }

    @ParameterizedTest(name = "{0} non-executive + grant -> 403")
    @MethodSource("approvalEndpoints")
    void approvalEndpoint_nonExecutiveOfficeWithMessengerAdminGrant_returns403(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(true);
        double permissionBefore = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());
        double departmentBefore = departmentDeniedCount(endpoint.role());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), "영업1팀"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name()))
                .isEqualTo(permissionBefore);
        assertThat(departmentDeniedCount(endpoint.role())).isEqualTo(departmentBefore + 1.0);
        verify(dynamicPermissionClient, never()).check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action()));
    }

    @ParameterizedTest(name = "{0} executive office + no grant -> 403")
    @MethodSource("approvalEndpoints")
    void approvalEndpoint_executiveOfficeWithoutMessengerAdminGrant_returns403(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    @Test
    void approvalEndpointsUseRequireDepartmentAndNoPreAuthorize() throws Exception {
        // P1-2 fix: 헤더 파라미터 추가로 메서드 시그니처 변경됨.
        assertDepartmentGate("createApproval", UUID.class, ApprovalLineCreateRequest.class);
        assertDepartmentGate("searchApprovers", String.class, int.class);
        assertDepartmentGate("approve", UUID.class, UUID.class, String.class, ApprovalDecisionRequest.class);
        assertDepartmentGate("reject", UUID.class, UUID.class, String.class, ApprovalDecisionRequest.class);
    }

    static Stream<EndpointCase> endpoints() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
        return Stream.of(
                new EndpointCase("create approval", APPROVAL_PAGE, PermissionAction.UPDATE, "MANAGER",
                        () -> post("/admin/groupware/approvals")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"requesterId":"00000000-0000-0000-0000-000000000011","title":"결재","content":"본문","approverIds":["00000000-0000-0000-0000-000000000012"]}
                                        """)),
                new EndpointCase("approve approval", APPROVAL_PAGE, PermissionAction.UPDATE, "MANAGER",
                        () -> put("/admin/groupware/approvals/{id}/approve", id)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"approverId":"00000000-0000-0000-0000-000000000012","reason":null}
                                        """)),
                new EndpointCase("reject approval", APPROVAL_PAGE, PermissionAction.UPDATE, "MANAGER",
                        () -> put("/admin/groupware/approvals/{id}/reject", id)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"approverId":"00000000-0000-0000-0000-000000000012","reason":"반려"}
                                        """)),
                new EndpointCase("approver search", APPROVAL_PAGE, PermissionAction.VIEW, "MANAGER",
                        () -> get("/admin/groupware/approvals/approver-search")
                                .param("q", "김")
                                .param("limit", "20")),
                new EndpointCase("send message", SEND_PAGE, PermissionAction.CREATE, "SALES",
                        () -> post("/admin/groupware/messages")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"senderId":"00000000-0000-0000-0000-000000000021","recipientId":"00000000-0000-0000-0000-000000000022","body":"안녕하세요"}
                                        """)),
                new EndpointCase("message inbox", SEND_PAGE, PermissionAction.VIEW, "SALES",
                        () -> get("/admin/groupware/messages/inbox")
                                .param("userId", "00000000-0000-0000-0000-000000000022")),
                new EndpointCase("mark message read", SEND_PAGE, PermissionAction.VIEW, "SALES",
                        () -> put("/admin/groupware/messages/{id}/read", id)),
                new EndpointCase("bulk send message", SEND_PAGE, PermissionAction.CREATE, "SALES",
                        () -> post("/admin/groupware/messages/bulk")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"recipientIds":["00000000-0000-0000-0000-000000000023"],"body":"복수 발송"}
                                        """)),
                new EndpointCase("recipient search", SEND_PAGE, PermissionAction.VIEW, "SALES",
                        () -> get("/admin/groupware/messages/recipient-search")
                                .param("q", "김")
                                .param("limit", "20")),
                new EndpointCase("create schedule", SCHEDULE_PAGE, PermissionAction.CREATE, "SALES",
                        () -> post("/admin/groupware/schedules")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(scheduleBody())),
                new EndpointCase("find schedule", SCHEDULE_PAGE, PermissionAction.VIEW, "SALES",
                        () -> get("/admin/groupware/schedules")
                                .param("ownerId", "00000000-0000-0000-0000-000000000031")
                                .param("from", "2026-05-26T08:00:00")
                                .param("to", "2026-05-26T18:00:00")),
                new EndpointCase("schedule detail", SCHEDULE_PAGE, PermissionAction.VIEW, "SALES",
                        () -> get("/admin/groupware/schedules/{id}", id)),
                new EndpointCase("update schedule", SCHEDULE_PAGE, PermissionAction.UPDATE, "SALES",
                        () -> put("/admin/groupware/schedules/{id}", id)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(scheduleBody())),
                new EndpointCase("delete schedule", SCHEDULE_PAGE, PermissionAction.DELETE, "MANAGER",
                        () -> delete("/admin/groupware/schedules/{id}", id))
        );
    }

    static Stream<EndpointCase> approvalEndpoints() {
        return endpoints().filter(endpoint -> APPROVAL_PAGE.equals(endpoint.page())
                && (endpoint.name().contains("approval") || endpoint.name().contains("approver")));
    }

    private static String scheduleBody() {
        return """
                {"ownerId":"00000000-0000-0000-0000-000000000031","title":"일정","description":"본문","startsAt":"2026-05-26T09:00:00","endsAt":"2026-05-26T10:00:00","status":null,"participantIds":[]}
                """;
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return withActor(request, role, HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME);
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role,
            String department) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role)
                .header(DEPARTMENT_HEADER, department);
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action
        ).count();
    }

    private double departmentDeniedCount(String role) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", "department",
                "role", role,
                "action", Department.EXECUTIVE_OFFICE.name()
        ).count();
    }

    private void assertDepartmentGate(String name, Class<?>... parameterTypes) throws Exception {
        Method method = GroupwareAdminController.class.getMethod(name, parameterTypes);
        RequireDepartment requireDepartment = method.getAnnotation(RequireDepartment.class);
        assertThat(requireDepartment).isNotNull();
        assertThat(requireDepartment.value()).isEqualTo(Department.EXECUTIVE_OFFICE);
        assertThat(method.getAnnotation(PreAuthorize.class)).isNull();
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }

    @TestConfiguration
    static class TestMeterConfig {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
