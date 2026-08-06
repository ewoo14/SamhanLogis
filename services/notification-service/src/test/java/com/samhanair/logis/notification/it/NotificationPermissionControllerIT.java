package com.samhanair.logis.notification.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.config.HeaderAuthenticationFilter;
import com.samhanair.logis.notification.controller.AligoAddressBookController;
import com.samhanair.logis.notification.controller.ChatRoomMappingAdminController;
import com.samhanair.logis.notification.controller.DispatchBatchAdminController;
import com.samhanair.logis.notification.controller.DispatchSmsSaveHistoryController;
import com.samhanair.logis.notification.controller.NotificationAdminController;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationSeverity;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.PartnerChatRoomMapping;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.AligoAddressBookSyncResponse;
import com.samhanair.logis.notification.dto.AligoAddressBookDeliveryStatus;
import com.samhanair.logis.notification.dto.ChatRoomImportResult;
import com.samhanair.logis.notification.dto.DispatchBatchPreviewResponse;
import com.samhanair.logis.notification.dto.DispatchBatchSendResponse;
import com.samhanair.logis.notification.service.AligoAddressBookSyncService;
import com.samhanair.logis.notification.service.ChatRoomImportService;
import com.samhanair.logis.notification.service.ChatRoomMappingService;
import com.samhanair.logis.notification.service.DispatchBatchPreviewService;
import com.samhanair.logis.notification.service.DispatchBatchSendService;
import com.samhanair.logis.notification.service.DispatchSmsSaveHistoryService;
import com.samhanair.logis.notification.service.NotificationCenterService;
import com.samhanair.logis.notification.service.NotificationService;
import com.samhanair.logis.notification.web.NotificationCenterController;
import com.samhanair.logis.notification.web.dto.NotificationCenterPage;
import com.samhanair.logis.notification.web.dto.NotificationCenterResponse;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryDetailResponse;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistorySaveResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** SP-D6-3 notification-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                NotificationAdminController.class,
                AligoAddressBookController.class,
                ChatRoomMappingAdminController.class,
                DispatchBatchAdminController.class,
                DispatchSmsSaveHistoryController.class,
                NotificationCenterController.class
        },
        properties = "spring.application.name=notification-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        NotificationPermissionControllerIT.TestSecurityConfig.class,
        NotificationPermissionControllerIT.TestMeterConfig.class
})
class NotificationPermissionControllerIT {

    private static final String SERVICE_NAME = "notification-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000301");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private NotificationService notificationService;
    @MockBean private AligoAddressBookSyncService aligoAddressBookSyncService;
    @MockBean private ChatRoomMappingService chatRoomMappingService;
    @MockBean private ChatRoomImportService chatRoomImportService;
    @MockBean private DispatchBatchPreviewService dispatchBatchPreviewService;
    @MockBean private DispatchBatchSendService dispatchBatchSendService;
    @MockBean private DispatchSmsSaveHistoryService dispatchSmsSaveHistoryService;
    @MockBean private NotificationCenterService notificationCenterService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        NotificationRequest request = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "010-1111-2222",
                NotificationChannel.SMS, null, "제목", "본문", null);
        request.markSent();
        lenient().when(notificationService.send(any())).thenReturn(request);
        lenient().when(notificationService.findAll(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 50), 1));
        lenient().when(notificationService.findById(any())).thenReturn(request);
        lenient().when(notificationService.retry(any())).thenReturn(request);

        lenient().when(aligoAddressBookSyncService.sync())
                .thenReturn(new AligoAddressBookSyncResponse(1, 0, 0, List.of(),
                        AligoAddressBookDeliveryStatus.DELIVERED));
        lenient().when(chatRoomMappingService.findAll()).thenReturn(List.of());
        lenient().when(chatRoomMappingService.findByPartnerCode(anyString())).thenReturn(List.of());
        lenient().when(chatRoomMappingService.findByPartnerBusinessName(anyString())).thenReturn(List.of());
        lenient().when(chatRoomMappingService.findByChatRoomName(anyString())).thenReturn(List.of());
        lenient().when(chatRoomMappingService.create(any()))
                .thenReturn(PartnerChatRoomMapping.manual("P001", "거래처", "발주방"));
        lenient().when(chatRoomImportService.importCsv(any()))
                .thenReturn(new ChatRoomImportResult(1, 0, List.of()));
        lenient().when(dispatchBatchPreviewService.preview(any()))
                .thenReturn(new DispatchBatchPreviewResponse(LocalDate.of(2026, 5, 26), 0, 0, 0, List.of(), List.of()));
        lenient().when(dispatchBatchSendService.send(any(), any()))
                .thenReturn(new DispatchBatchSendResponse(LocalDate.of(2026, 5, 26), 1, 0, 0, List.of()));
        lenient().when(dispatchSmsSaveHistoryService.save(any(), anyString()))
                .thenReturn(new DispatchSmsSaveHistorySaveResponse(ID, LocalDateTime.of(2026, 5, 26, 9, 0)));
        lenient().when(dispatchSmsSaveHistoryService.list(any(), any(), any(), any(), anyString(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(dispatchSmsSaveHistoryService.findDetail(any(), anyString()))
                .thenReturn(historyDetail());
        lenient().when(dispatchSmsSaveHistoryService.findLatestAutoLatest(any(), anyString()))
                .thenReturn(historyDetail());
        NotificationCenterResponse centerResponse = new NotificationCenterResponse(
                ID,
                "PUSH",
                NotificationSeverity.INFO,
                "알림",
                "본문",
                "/notifications",
                LocalDateTime.of(2026, 5, 27, 9, 0),
                null,
                null);
        lenient().when(notificationCenterService.findMyUnread(any(), anyString()))
                .thenReturn(List.of(centerResponse));
        lenient().when(notificationCenterService.findMyHistory(any(), anyString(), any()))
                .thenReturn(new NotificationCenterPage(List.of(centerResponse), 0, 50, 1, 1));
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_returnsSuccess(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(endpoint.successStatus()));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                new EndpointCase("notification send", "notifications.admin", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/admin/notifications/send")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(notificationBody())),
                new EndpointCase("notification list", "notifications.admin", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/admin/notifications")),
                new EndpointCase("notification detail", "notifications.admin", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/admin/notifications/{id}", ID)),
                new EndpointCase("notification retry", "notifications.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/admin/notifications/{id}/retry", ID)),
                new EndpointCase("aligo address sync", "aligo.address-book", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/admin/notification/aligo/address-book/sync")),
                new EndpointCase("chat-room list", "messenger.admin", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/notification/admin/chat-rooms")),
                new EndpointCase("chat-room create", "messenger.admin", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/api/v1/notification/admin/chat-rooms")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"partnerCode":"P001","partnerBusinessName":"거래처","chatRoomName":"발주방"}
                                        """)),
                new EndpointCase("chat-room import", "messenger.admin", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/api/v1/notification/admin/chat-rooms/import")
                                .file(new MockMultipartFile("file", "rooms.csv", "text/csv", "x".getBytes()))),
                new EndpointCase("chat-room delete", "messenger.admin", PermissionAction.DELETE, "MANAGER", 200,
                        () -> delete("/api/v1/notification/admin/chat-rooms/{id}", ID)),
                new EndpointCase("dispatch batch preview", "dispatch.batch", PermissionAction.CREATE, "DISPATCH", 200,
                        () -> post("/admin/notifications/dispatch-batch/preview")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"date\":\"2026-05-26\"}")),
                new EndpointCase("dispatch batch send", "dispatch.batch", PermissionAction.CREATE, "DISPATCH", 200,
                        () -> post("/admin/notifications/dispatch-batch/send")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(dispatchSendBody())),
                new EndpointCase("sms history save", "dispatch.sms-save-history", PermissionAction.CREATE, "DISPATCH", 200,
                        () -> post("/admin/notifications/dispatch-sms/history")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(historyBody())),
                new EndpointCase("sms history list", "dispatch.sms-save-history", PermissionAction.VIEW, "DISPATCH", 200,
                        () -> get("/admin/notifications/dispatch-sms/history")),
                new EndpointCase("sms history detail", "dispatch.sms-save-history", PermissionAction.VIEW, "DISPATCH", 200,
                        () -> get("/admin/notifications/dispatch-sms/history/{id}", ID)),
                new EndpointCase("sms history latest", "dispatch.sms-save-history", PermissionAction.VIEW, "DISPATCH", 200,
                        () -> get("/admin/notifications/dispatch-sms/history/latest")
                                .param("programType", "DISPATCH_SMS")),
                new EndpointCase("notification center unread", "notifications.center", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/notifications/my")),
                new EndpointCase("notification center history", "notifications.center", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/notifications/history")),
                new EndpointCase("notification center acknowledge", "notifications.center", PermissionAction.VIEW, "STAFF", 200,
                        () -> post("/notifications/{id}/acknowledge", ID))
        );
    }

    private static String notificationBody() {
        return """
                {"recipientType":"EXTERNAL_PHONE","recipientAddress":"010-1111-2222","channel":"SMS","subject":"제목","body":"본문"}
                """;
    }

    private static String dispatchSendBody() {
        return """
                {"date":"2026-05-26","entries":[{"partnerCode":"P001","recipientPhone":"010-1111-2222","message":"본문","chatRoomName":"발주방"}]}
                """;
    }

    private static String historyBody() {
        return """
                {"programType":"DISPATCH_SMS","saveMode":"MANUAL_NAMED","topic":"저장","requestParams":{"rowCount":1},"responsePayload":{"sent":1}}
                """;
    }

    private DispatchSmsSaveHistoryDetailResponse historyDetail() {
        return new DispatchSmsSaveHistoryDetailResponse(
                ID,
                com.samhanair.logis.notification.domain.DispatchSmsProgramType.DISPATCH_SMS,
                com.samhanair.logis.notification.domain.DispatchSmsSaveMode.MANUAL_NAMED,
                "저장",
                LocalDateTime.of(2026, 5, 26, 9, 0),
                "dispatch-user",
                objectMapper.createObjectNode().put("rowCount", 1),
                1,
                objectMapper.createObjectNode().put("sent", 1));
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request.header(USER_ID_HEADER, UUID.randomUUID().toString()).header(ROLE_HEADER, role);
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

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            int successStatus,
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
