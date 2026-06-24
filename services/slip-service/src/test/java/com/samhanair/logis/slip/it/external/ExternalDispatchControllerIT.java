package com.samhanair.logis.slip.it.external;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** 타배송사 SMS 발송 admin API 통합 테스트. */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "dispatcher", authorities = {"ROLE_MASTER"})
class ExternalDispatchControllerIT extends AbstractPostgresIT {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000321";
    private static final String PAGE_CODE = "dispatch.board";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired SlipRepository slipRepository;
    @Autowired ExternalCarrierRepository externalCarrierRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @MockBean NotificationClient notificationClient;
    @MockBean ArologisDispatchClient arologisDispatchClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean NotificationChatRoomClient notificationChatRoomClient;
    @MockBean PartnerBlockClient partnerBlockClient;
    @MockBean PartnerInternalClient partnerInternalClient;
    @MockBean ProductClient productClient;
    @MockBean ReceiptOcrClient receiptOcrClient;
    @MockBean SmsGateway smsGateway;
    @MockBean UserInternalClient userInternalClient;
    @MockBean WarehouseInternalClient warehouseInternalClient;

    @Test
    void POST_externalDispatches_sms_success_marksSlipsDispatchedAndSavesHistory() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("한빛퀵", "010-7000-0001", null, null, null));
        Slip first = saveDispatchReadySlip("2026/06/24-EDS-001", 801);
        Slip second = saveDispatchReadySlip("2026/06/24-EDS-002", 802);
        when(notificationClient.sendExternalSmsWithResult(anyString(), anyString(), anyString()))
                .thenReturn(true);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(first.getId(), second.getId()),
                                "channel", "SMS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carrierName").value("한빛퀵"))
                .andExpect(jsonPath("$.data.status").value("SENT"))
                .andExpect(jsonPath("$.data.slipCount").value(2))
                .andExpect(jsonPath("$.data.slipNos[0]").value(first.getSlipNo()));

        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(first.getId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.DISPATCHED);
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(second.getId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.DISPATCHED);
        Integer dispatchCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM external_dispatch WHERE carrier_id = ? AND status = 'SENT'",
                Integer.class, carrier.getId());
        Integer slipCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM external_dispatch_slip WHERE external_dispatch_id IN "
                        + "(SELECT id FROM external_dispatch WHERE carrier_id = ?)",
                Integer.class, carrier.getId());
        org.assertj.core.api.Assertions.assertThat(dispatchCount).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(slipCount).isEqualTo(2);
    }

    @Test
    void POST_externalDispatches_rejectsUninspectedOrAlreadyDispatchedSlip() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("한빛퀵2", "010-7000-0002", null, null, null));
        Slip uninspected = saveUninspectedCompletedSlip("2026/06/24-EDS-003", 803);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(uninspected.getId()),
                                "channel", "SMS"))))
                .andExpect(status().isConflict());

        Slip dispatched = saveDispatchReadySlip("2026/06/24-EDS-004", 804);
        dispatched.markDispatchedExternally();
        slipRepository.saveAndFlush(dispatched);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(dispatched.getId()),
                                "channel", "SMS"))))
                .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser(username = "sales", authorities = {"ROLE_SALES"})
    void POST_externalDispatches_withoutCreatePermission_returns403() throws Exception {
        UUID actor = UUID.fromString("10000000-0000-0000-0000-000000000323");
        Mockito.when(dynamicPermissionClient.check(actor, PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(false);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", actor.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", UUID.randomUUID(),
                                "slipIds", List.of(UUID.randomUUID()),
                                "channel", "SMS"))))
                .andExpect(status().isForbidden());
    }

    private Slip saveDispatchReadySlip(String slipNo, int seqNo) {
        Slip slip = saveUninspectedCompletedSlip(slipNo, seqNo);
        slip.inspect(USER_ID);
        return slipRepository.saveAndFlush(slip);
    }

    private Slip saveUninspectedCompletedSlip(String slipNo, int seqNo) {
        Slip slip = Slip.createOutbound(
                slipNo,
                LocalDate.of(2026, 6, 24),
                seqNo,
                UUID.randomUUID(),
                null,
                UUID.randomUUID(),
                "타배송사 거래처 " + seqNo,
                DeliveryTag.DAY,
                "external dispatch IT",
                USER_ID);
        slip.setPartnerCode("EDS-" + seqNo);
        slip.withProjectInfo(null, "서울시 강남구 테스트로 " + seqNo, null, null,
                "010-1000-" + seqNo, null);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "무풍 실내기", "AJ040",
                null, 2, BigDecimal.ZERO, null));
        slip.save();
        slip.send();
        slip.accept(USER_ID);
        slip.process();
        slip.complete();
        return slipRepository.saveAndFlush(slip);
    }
}
