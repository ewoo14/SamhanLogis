package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.SourceOperationContext;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * S3 OUTBOUND 시리얼 인스턴스 slip-service 연동 IT.
 *
 * <p>slip_db 는 실제 Testcontainers Postgres 를 사용하고, 외부 product/inventory/user/warehouse
 * client 는 {@code @MockBean} 으로 격리한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipOutboundInstanceIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    private UUID serialProductId;
    private UUID batchProductId;
    private UUID sourceWarehouseId;

    @BeforeEach
    void setUp() {
        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();
        sourceWarehouseId = UUID.randomUUID();

        ProductSummary serial = new ProductSummary(serialProductId, "S3 에어컨", "AC-S3",
                "AC-S3-SLIP", UUID.randomUUID(), new BigDecimal("500000"), "ACTIVE", true);
        ProductSummary batch = new ProductSummary(batchProductId, "S3 배관", "PIPE-S3",
                "PIPE-S3-SLIP", UUID.randomUUID(), new BigDecimal("10000"), "ACTIVE", false);

        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(partnerInternalClient.resolveBusinessNumber(ArgumentMatchers.any()))
                .thenReturn(Optional.empty());
        Mockito.lenient().when(warehouseInternalClient.findWarehouseName(ArgumentMatchers.any()))
                .thenReturn(Optional.empty());
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> id.equals(serialProductId) ? serial : batch)
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(serialProductId)).thenReturn(serial);
        Mockito.lenient().when(productClient.requireExists(batchProductId)).thenReturn(batch);
    }

    @Test
    void accept_outboundSerialAndBatch_routesReserveByLineType() throws Exception {
        String slipId = createSentSlip();

        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        verify(inventoryClient, times(1))
                .reserveInstances(eq("AC-S3-SLIP"), eq(sourceWarehouseId), eq(5), anyString());
        verify(inventoryClient, times(1))
                .reserve(eq(batchProductId), eq(sourceWarehouseId), eq(4), anyString(), any(UUID.class));
        verify(inventoryClient, never())
                .reserve(eq(serialProductId), any(), anyInt(), anyString(), any());
    }

    @Test
    void complete_outboundSerialAndBatch_routesShipAndDeduct() throws Exception {
        String slipId = createAcceptedSlip();
        mockMvc.perform(post("/slips/" + slipId + "/process")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/" + slipId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        verify(inventoryClient, times(1))
                .shipInstances(anyString(), eq("AC-S3-SLIP"), eq(null), eq(null),
                        any(SourceOperationContext.class));
        verify(inventoryClient, times(1))
                .deduct(eq(batchProductId), eq(sourceWarehouseId), eq(4), eq(true),
                        anyString(), any(UUID.class), any(SourceOperationContext.class));
        verify(inventoryClient, never())
                .deduct(eq(serialProductId), any(), anyInt(), eq(true), anyString(), any(),
                        any(SourceOperationContext.class));
    }

    @Test
    void reject_afterAcceptedSerialAndBatch_routesReleaseByLineType() throws Exception {
        String slipId = createAcceptedSlip();

        mockMvc.perform(post("/slips/" + slipId + "/reject")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "재고 없음"))))
                .andExpect(status().isOk());

        verify(inventoryClient, times(1))
                .releaseInstances(anyString(), eq("AC-S3-SLIP"));
        verify(inventoryClient, times(1))
                .release(eq(batchProductId), eq(sourceWarehouseId), eq(4), anyString(), any(UUID.class));
        verify(inventoryClient, never())
                .release(eq(serialProductId), any(), anyInt(), anyString(), any());
    }

    @Test
    void accept_inventoryFailure_rollsBackSlipStatus() throws Exception {
        String slipId = createSentSlip();
        doThrow(new BusinessException(ErrorCode.CONFLICT, "재고 부족"))
                .when(inventoryClient)
                .reserveInstances(eq("AC-S3-SLIP"), eq(sourceWarehouseId), eq(5), anyString());

        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isConflict());

        UUID id = OpaqueUuidTestDecoder.decode(slipId);
        assertThat(slipRepository.findById(id).orElseThrow().getStatus()).isEqualTo(SlipStatus.SENT);
    }

    private String createAcceptedSlip() throws Exception {
        String slipId = createSentSlip();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        return slipId;
    }

    private String createSentSlip() throws Exception {
        String slipId = createDraftSlip();
        mockMvc.perform(post("/slips/" + slipId + "/save")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        return slipId;
    }

    private String createDraftSlip() throws Exception {
        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createOutboundBody())))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private Map<String, Object> createOutboundBody() {
        Map<String, Object> serialLine1 = line(serialProductId, "S3 에어컨", "AC-S3", 2, 500000);
        Map<String, Object> serialLine2 = line(serialProductId, "S3 에어컨", "AC-S3", 3, 500000);
        Map<String, Object> batchLine = line(batchProductId, "S3 배관", "PIPE-S3", 4, 10000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-06-02");
        body.put("sourceWarehouseId", sourceWarehouseId.toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "S3 거래처");
        body.put("partnerCode", "P-S3-SLIP");
        body.put("deliveryTag", "DAY");
        body.put("lines", List.of(serialLine1, serialLine2, batchLine));
        return body;
    }

    private Map<String, Object> line(UUID productId, String productName, String modelName,
                                     int quantity, int unitPrice) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", productId.toString());
        line.put("productName", productName);
        line.put("modelName", modelName);
        line.put("quantity", quantity);
        line.put("unitPrice", unitPrice);
        return line;
    }
}
