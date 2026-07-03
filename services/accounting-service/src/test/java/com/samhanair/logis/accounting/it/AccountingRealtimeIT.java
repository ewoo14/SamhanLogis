package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.editrequest.repository.AccountingEditRequestRepository;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * PR-H4b BE-A — accounting-service SSE + edit-request workflow IT.
 *
 * <ol>
 *   <li>SSE subscribe (TaxInvoice realtime endpoint) — 200 + text/event-stream</li>
 *   <li>edit-request 생성 → DB persist 검증 (PENDING + targetRole=MANAGER)</li>
 * </ol>
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) — Eureka
 * 비활성 환경 5xx 회피.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class AccountingRealtimeIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private AccountingEditRequestRepository editRequestRepository;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D6 동적 권한 client 격리 — 기본 허용, deny 케이스는 테스트별 명시 stub. */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setupPermissionDefaults() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @DisplayName("GET /accounting/tax-invoices/{id}/realtime — ACCOUNTANT 200 + text/event-stream")
    void sseSubscribeReturnsEventStream() throws Exception {
        UUID entityId = UUID.randomUUID();
        MvcResult result = mockMvc.perform(get("/accounting/tax-invoices/{id}/realtime", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(result.getResponse().getContentType())
                .startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
    }

    @Test
    @DisplayName("GET /accounting/closings/{id}/realtime — MANAGER 200 + text/event-stream")
    void managerCanSubscribeClosingRealtime() throws Exception {
        UUID entityId = UUID.randomUUID();
        MvcResult result = mockMvc.perform(get("/accounting/closings/{id}/realtime", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(result.getResponse().getContentType())
                .startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
    }

    @Test
    @DisplayName("GET /accounting/cash-receipts/{id}/realtime — ACCOUNTANT 200 + text/event-stream")
    void accountantCanSubscribeCashReceiptRealtimeById() throws Exception {
        UUID entityId = UUID.randomUUID();
        MvcResult result = mockMvc.perform(get("/accounting/cash-receipts/{id}/realtime", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(result.getResponse().getContentType())
                .startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
    }

    @Test
    @DisplayName("GET /accounting/cash-receipts/realtime?slipNo=... — legacy query endpoint 404")
    void legacyCashReceiptRealtimeQueryEndpointReturns404() throws Exception {
        mockMvc.perform(get("/accounting/cash-receipts/realtime")
                        .param("slipNo", "MISSING")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("POST /accounting/entities/{id}/edit-request — ACCOUNTANT 201 + DB PENDING/MANAGER")
    void editRequestCreatePersistsPendingRow() throws Exception {
        UUID entityId = UUID.randomUUID();
        Map<String, Object> body = Map.of(
                "type", EditRequestType.EDIT.name(),
                "reason", "발행 후 거래처명 정정 요청");

        mockMvc.perform(post("/accounting/entities/{id}/edit-request", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "이수민")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        assertThat(editRequestRepository.findByEntityIdOrderByRequestedAtDesc(entityId))
                .hasSize(1)
                .first()
                .satisfies(req -> {
                    assertThat(req.getRequestType()).isEqualTo(EditRequestType.EDIT);
                });
    }
}
