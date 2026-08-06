package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처별 원장 판매전표 internal read 계약 통합 테스트.
 *
 * <p>기존 {@code /internal/slips/outbound-lines} 계약과 분리된 전표 단위 projection을 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipPartnerLedgerInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String URL = "/internal/slips/partner-ledger-sales";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @Test
    void returnsEveryOutboundStatusAfterInventoryDispatchWithLinesAndNoUuid() throws Exception {
        Slip completed = persistOutboundAtStatus("P-COMP", "완료 전표", SlipStatus.COMPLETED,
                LocalDate.of(2026, 7, 28));
        Slip delivered = persistOutboundAtStatus("P-DELIV", "배송 전표", SlipStatus.DELIVERED,
                LocalDate.of(2026, 7, 29));
        Slip confirmed = persistOutboundAtStatus("P-CONF", "확정 전표", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 7, 30));
        Slip inspecting = persistOutboundAtStatus("P-INSP", "검수중 전표", SlipStatus.INSPECTING,
                LocalDate.of(2026, 7, 30));
        Slip shipping = persistOutboundAtStatus("P-SHIP", "배송중 전표", SlipStatus.SHIPPING,
                LocalDate.of(2026, 7, 30));

        MvcResult result = mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-07-28")
                        .param("to", "2026-07-30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(raw).get("data");

        assertThat(rows).hasSize(5);
        assertThat(raw).contains(completed.getSlipNo(), delivered.getSlipNo(), confirmed.getSlipNo());
        assertThat(raw).contains(inspecting.getSlipNo(), shipping.getSlipNo());
        assertThat(raw).doesNotContain("slipId", "lineId");
        JsonNode completedRow = findBySlipNo(rows, completed.getSlipNo());
        assertThat(completedRow.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(completedRow.get("deliveryAddress").asText())
                .isEqualTo("서울시 금천구 원장 테스트길 1");
        assertThat(completedRow.get("lines").get(0).get("productName").asText())
                .isEqualTo("원장 품목");
        assertThat(completedRow.get("lines").get(0).get("modelName").asText())
                .isEqualTo("MODEL-LEDGER");
        assertThat(completedRow.get("lines").get(0).get("quantity").asInt()).isEqualTo(2);
        assertThat(completedRow.get("lines").get(0).get("unitPriceWithVat").decimalValue())
                .isEqualByComparingTo("11000.00");
        assertThat(completedRow.get("lines").get(0).get("lineAmount").decimalValue())
                .isEqualByComparingTo("22000.00");
    }

    @Test
    void filtersByBusinessPartnerCodeAndDateWithoutChangingExistingContract() throws Exception {
        Slip included = persistOutboundAtStatus("P-FILTER", "필터 거래처", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 7, 31));
        Slip otherPartner = persistOutboundAtStatus("P-OTHER", "다른 거래처", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 7, 31));
        Slip outsideDate = persistOutboundAtStatus("P-FILTER", "범위 밖", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 8, 1));

        MvcResult result = mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-07-31")
                        .param("to", "2026-07-31")
                        .param("partnerCode", "P-FILTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(raw).get("data");
        assertThat(rows).hasSize(1);
        assertThat(raw).contains(included.getSlipNo());
        assertThat(raw).doesNotContain(otherPartner.getSlipNo(), outsideDate.getSlipNo());
    }

    @Test
    void filtersByInternalPartnerIdWhenLegacyPartnerCodeIsBlank() throws Exception {
        Slip included = persistOutboundAtStatus("P-LEGACY-BLANK", "대상 거래처", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 7, 31));
        included.setPartnerCode(null);
        slipRepository.saveAndFlush(included);
        Slip other = persistOutboundAtStatus("P-OTHER-BLANK", "다른 거래처", SlipStatus.CONFIRMED,
                LocalDate.of(2026, 7, 31));
        other.setPartnerCode(null);
        slipRepository.saveAndFlush(other);

        MvcResult result = mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-07-31")
                        .param("to", "2026-07-31")
                        .param("partnerId", included.getPartnerId().toString()))
                .andExpect(status().isOk())
                .andReturn();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(raw).get("data");
        assertThat(rows).hasSize(1);
        assertThat(raw).contains(included.getSlipNo());
        assertThat(raw).doesNotContain(other.getSlipNo());
        assertThat(rows.get(0).get("partnerId").asText()).isEqualTo(included.getPartnerId().toString());
    }

    @Test
    void rejectsMissingInternalToken() throws Exception {
        mockMvc.perform(get(URL)
                        .param("from", "2026-07-31")
                        .param("to", "2026-07-31"))
                .andExpect(status().isForbidden());
    }

    private Slip persistOutboundAtStatus(String partnerCode, String partnerName,
                                         SlipStatus targetStatus, LocalDate slipDate) {
        Slip slip = Slip.createOutbound(
                uniqueSlipNo(slipDate),
                slipDate,
                (int) (System.nanoTime() % 100000) + 1,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                partnerName,
                null,
                "원장 테스트",
                "tester");
        slip.setPartnerCode(partnerCode);
        slip.withProjectInfo(null, "서울시 금천구 원장 테스트길 1", null, null, null, null);
        slip.addLine(SlipLine.createFromVatInclusive(
                slip,
                UUID.randomUUID(),
                "원장 품목",
                "MODEL-LEDGER",
                null,
                2,
                new BigDecimal("11000.00"),
                null,
                null));
        advanceTo(slip, targetStatus);
        return slipRepository.saveAndFlush(slip);
    }

    private void advanceTo(Slip slip, SlipStatus targetStatus) {
        if (targetStatus == SlipStatus.DRAFT) {
            return;
        }
        slip.save();
        if (targetStatus == SlipStatus.SAVED) {
            return;
        }
        slip.send();
        if (targetStatus == SlipStatus.SENT) {
            return;
        }
        slip.accept("acceptor");
        if (targetStatus == SlipStatus.ACCEPTED) {
            return;
        }
        slip.process();
        if (targetStatus == SlipStatus.PROCESSING) {
            return;
        }
        slip.complete();
        if (targetStatus == SlipStatus.INSPECTING) {
            return;
        }
        slip.inspect("inspector");
        if (targetStatus == SlipStatus.COMPLETED) {
            return;
        }
        slip.ship();
        if (targetStatus == SlipStatus.SHIPPING) {
            return;
        }
        slip.deliver();
        if (targetStatus == SlipStatus.DELIVERED) {
            return;
        }
        slip.confirm();
    }

    private JsonNode findBySlipNo(JsonNode rows, String slipNo) {
        for (JsonNode row : rows) {
            if (slipNo.equals(row.get("slipNo").asText())) {
                return row;
            }
        }
        throw new AssertionError("전표번호를 찾지 못했습니다: " + slipNo);
    }

    private String uniqueSlipNo(LocalDate date) {
        return date.toString().replace('-', '/') + "-LEDGER-" + (System.nanoTime() % 100000);
    }
}
