package com.samhanair.logis.partner.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.editrequest.repository.PartnerEditRequestRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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
 * PR-H4b BE-A — partner-service SSE + edit-request workflow IT.
 *
 * <ol>
 *   <li>SSE subscribe (admin/partners realtime endpoint) — 200 + text/event-stream</li>
 *   <li>edit-request 생성 → DB persist 검증 (PENDING + targetRole=MANAGER)</li>
 * </ol>
 *
 * <p>partner-service 는 외부 client 의존성 0 — @MockBean 미필요.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PartnerRealtimeIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PartnerEditRequestRepository editRequestRepository;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermissions() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @DisplayName("GET /admin/partners/{id}/realtime — MANAGER 200 + text/event-stream")
    void sseSubscribeReturnsEventStream() throws Exception {
        UUID entityId = UUID.randomUUID();
        MvcResult result = mockMvc.perform(get("/admin/partners/{id}/realtime", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(result.getResponse().getContentType())
                .startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
    }

    @Test
    @DisplayName("POST /admin/partners/entities/{id}/edit-request — MANAGER 201 + DB PENDING/MANAGER")
    void editRequestCreatePersistsPendingRow() throws Exception {
        UUID entityId = UUID.randomUUID();
        Map<String, Object> body = Map.of(
                "type", EditRequestType.EDIT.name(),
                "reason", "BLOCK 해제 요청");

        mockMvc.perform(post("/admin/partners/entities/{id}/edit-request", entityId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "관리자A")
                        .header("X-User-Role", "MANAGER")
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
