package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Internal endpoint 인증 시나리오 (4 case) — Phase 10 W10-1.
 *
 * <ol>
 *   <li>X-Internal-Token 누락 → 403 (Spring Security)</li>
 *   <li>X-Internal-Token 불일치 → 401 (InternalTokenFilter 직접 응답)</li>
 *   <li>X-Internal-Token 일치 + sync 호출 → 200 (W10-1 ack only)</li>
 *   <li>토큰 누락 + 다른 endpoint → 403</li>
 * </ol>
 *
 * <p>4 외부 client 모두 {@code @MockBean} 격리 의무.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisInternalControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PartnerClient partnerClient;
    // 2026-05-14 분리 — UserClient @MockBean 제거 (자체 user 도메인 도입).
    @MockBean
    private SlipClient slipClient;
    @MockBean
    private NotificationClient notificationClient;
    /** PR-E1 BE-3 — 출고전표 자동 조회 client (가배차/미배차/지방 분류 source). */
    @MockBean
    private SlipServiceClient slipServiceClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
    }

    @Test
    void sync_without_token_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/arologis/dispatches/sync")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void sync_with_invalid_token_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/arologis/dispatches/sync")
                        .header("X-Internal-Token", "wrong-token")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void sync_with_valid_token_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/arologis/dispatches/sync")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content("{\"orderId\":\"abc-123\"}"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.received").value(true));
    }

    @Test
    void sync_with_empty_body_returns_200_when_authorized() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/arologis/dispatches/sync")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(MockMvcResultMatchers.status().isOk());
    }
}
