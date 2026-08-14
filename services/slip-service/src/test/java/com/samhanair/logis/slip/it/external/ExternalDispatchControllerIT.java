package com.samhanair.logis.slip.it.external;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
    void POST_externalDispatches_print_marksSlipsDispatchedWithoutSms() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("인쇄전용퀵", "010-7000-0101", null, null, null));
        Slip slip = saveDispatchReadySlip("2026/06/24-EDP-PRINT-001", 811);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(slip.getId()),
                                "channel", "PRINT"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carrierName").value("인쇄전용퀵"))
                .andExpect(jsonPath("$.data.channel").value("PRINT"))
                .andExpect(jsonPath("$.data.status").value("SENT"))
                .andExpect(jsonPath("$.data.slipNos[0]").value(slip.getSlipNo()));

        verify(notificationClient, never()).sendExternalSmsWithResult(anyString(), anyString(), anyString());
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slip.getId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.DISPATCHED);
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT channel, status FROM external_dispatch WHERE carrier_id = ?",
                carrier.getId());
        org.assertj.core.api.Assertions.assertThat(row.get("channel")).isEqualTo("PRINT");
        org.assertj.core.api.Assertions.assertThat(row.get("status")).isEqualTo("SENT");
    }

    @Test
    void POST_externalDispatches_both_success_callsSmsAndMarksSlipsDispatched() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("양방향퀵", "010-7000-0102", null, null, null));
        Slip slip = saveDispatchReadySlip("2026/06/24-EDP-BOTH-001", 812);
        when(notificationClient.sendExternalSmsWithResult(anyString(), anyString(), anyString()))
                .thenReturn(true);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(slip.getId()),
                                "channel", "BOTH"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.channel").value("BOTH"))
                .andExpect(jsonPath("$.data.status").value("SENT"));

        verify(notificationClient).sendExternalSmsWithResult(anyString(), anyString(), anyString());
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slip.getId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.DISPATCHED);
    }

    @Test
    void POST_externalDispatches_both_smsFailed_keepsSlipUndispatchedAndSavesFailedHistory() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("양방향실패퀵", "010-7000-0103", null, null, null));
        Slip slip = saveDispatchReadySlip("2026/06/24-EDP-BOTH-FAIL-001", 813);
        when(notificationClient.sendExternalSmsWithResult(anyString(), anyString(), anyString()))
                .thenReturn(false);

        mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(slip.getId()),
                                "channel", "BOTH"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.channel").value("BOTH"))
                .andExpect(jsonPath("$.data.status").value("FAILED"));

        verify(notificationClient).sendExternalSmsWithResult(anyString(), anyString(), anyString());
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slip.getId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.UNDISPATCHED);
        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM external_dispatch WHERE carrier_id = ?",
                String.class, carrier.getId());
        org.assertj.core.api.Assertions.assertThat(status).isEqualTo("FAILED");
    }

    @Test
    void GET_externalDispatchPrintData_returnsCarrierAndSlipLinesWithoutUuid() throws Exception {
        ExternalCarrier carrier = externalCarrierRepository.saveAndFlush(
                ExternalCarrier.create("인쇄조회퀵", "010-7000-0104", null, null, null));
        Slip first = saveDispatchReadySlip("2026/06/24-EDP-PRINTDATA-001", 814);
        Slip second = saveDispatchReadySlip("2026/06/24-EDP-PRINTDATA-002", 815);

        String postJson = mvc.perform(post("/admin/external-dispatches")
                        .header("X-User-Id", USER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "carrierId", carrier.getId(),
                                "slipIds", List.of(first.getId(), second.getId()),
                                "channel", "PRINT"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String dispatchId = objectMapper.readTree(postJson).path("data").path("id").asText();

        String printJson = mvc.perform(get("/admin/external-dispatches/{id}/print-data", dispatchId)
                        .header("X-User-Id", USER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carrierName").value("인쇄조회퀵"))
                .andExpect(jsonPath("$.data.carrierPhone").value("010-7000-0104"))
                .andExpect(jsonPath("$.data.channel").value("PRINT"))
                .andExpect(jsonPath("$.data.items[0].slipNo").value(first.getSlipNo()))
                .andExpect(jsonPath("$.data.items[0].deliveryAddress").value("서울시 강남구 테스트로 814"))
                .andExpect(jsonPath("$.data.items[0].recipientPhone").value("010-1000-814"))
                .andExpect(jsonPath("$.data.items[0].itemSummary").value("AJ040 2대"))
                .andExpect(jsonPath("$.data.items[0].recipientName").value("타배송사 거래처 814"))
                .andExpect(jsonPath("$.data.items[1].slipNo").value(second.getSlipNo()))
                .andReturn()
                .getResponse()
                .getContentAsString();

        org.assertj.core.api.Assertions.assertThat(printJson).doesNotContain(first.getId().toString());
        org.assertj.core.api.Assertions.assertThat(printJson).doesNotContain(second.getId().toString());
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
                DeliveryTag.SALE,
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
