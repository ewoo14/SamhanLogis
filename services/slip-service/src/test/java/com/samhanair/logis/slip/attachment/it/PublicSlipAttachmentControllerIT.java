package com.samhanair.logis.slip.attachment.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.attachment.repository.SlipAttachmentRepository;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.it.OpaqueUuidTestDecoder;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 모바일 첨부 endpoint IT.
 *
 * <p>URL path 에서는 {@code 2026-05-20-1} 하이픈 slug 를 받고, DB 조회는 저장 표준
 * {@code 2026/05/20-1} 슬래시 전표번호로 수행해야 한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PublicSlipAttachmentControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private SlipAttachmentRepository attachmentRepository;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockClients() {
        lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        lenient().when(productClient.lookup(anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        lenient().when(smsGateway.sendSms(anyString(), anyString()))
                .thenReturn(SmsResult.success("mock-id"));
    }

    @Test
    void upload_hyphenSlipNoSlug_returns201_andStoresAttachment() throws Exception {
        Context ctx = createBatchedSlip();
        MockMultipartFile file = new MockMultipartFile(
                "file", "delivery.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/public/batches/" + ctx.batchToken
                                + "/slips/" + toPathSlug(ctx.slipNo) + "/attachments")
                        .file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentType").value("DELIVERY"))
                .andExpect(jsonPath("$.data.fileName").value("delivery.png"));

        var attachments = attachmentRepository.findBySlipIdAndIsDeletedFalseOrderByUploadedAtAsc(
                OpaqueUuidTestDecoder.decode(ctx.slipId));
        assertThat(attachments).hasSize(1);
        assertThat(attachments.get(0).getFileName()).isEqualTo("delivery.png");
    }

    private Context createBatchedSlip() throws Exception {
        String today = LocalDate.now().toString();
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", today);
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "SALE");
        body.put("driverName", "김기사");
        body.put("driverPhone", "010-1111-2222");
        body.put("lines", List.of(line));

        MvcResult res = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        var json = objectMapper.readTree(res.getResponse().getContentAsString()).get("data");
        String slipId = json.get("id").asText();
        String slipNo = json.get("slipNo").asText();

        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", today)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String batchToken = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("batchToken").asText();

        assertThat(slipRepository.findById(OpaqueUuidTestDecoder.decode(slipId)).orElseThrow().getSlipNo())
                .isEqualTo(slipNo)
                .contains("/");
        return new Context(slipId, slipNo, batchToken);
    }

    private static String toPathSlug(String slipNo) {
        return slipNo.replace("/", "-");
    }

    private record Context(String slipId, String slipNo, String batchToken) {
    }
}
