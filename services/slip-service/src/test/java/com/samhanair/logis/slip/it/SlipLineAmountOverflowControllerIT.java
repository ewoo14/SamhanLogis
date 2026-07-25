package com.samhanair.logis.slip.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;

/**
 * MED-4(#824 R2) — PM 라이브QA 실서버 재현(dev_sales, POST /api/slips) 을 실 Postgres
 * IT 경로로 재현한다.
 *
 * <p><b>왜 컨트롤러/IT 층인가</b>: R1 은 {@code SlipLine.validateAmount} 도메인 단위 테스트만
 * 통과시켰지만 실서버는 여전히 500 이었다. 원인은 두 가지다.
 * <ol>
 *   <li><b>경로 누락</b> — {@code validateAmount} 는 {@code createFromAuthoritativeAmounts}
 *       (화면에서 공급가액/부가세/합계 3값을 명시 편집해 보내는 소수 경로)에서만 호출됐다.
 *       {@code POST /api/slips} 가 실제로 쓰는 기본 경로는 평문 단가만 보내는
 *       {@code SlipLine.create()}(VAT 미포함) 또는 {@code createFromVatInclusive()}(VAT 포함,
 *       2026-06-09 라인단위 eCount 전환 후 기본값) 인데, 이 둘은 {@code validateAmount} 를
 *       전혀 호출하지 않았다 — 도메인 단위 테스트가 건드리지 않는 정확히 그 경로다.</li>
 *   <li><b>임계값 불일치</b> — {@code unit_price}/{@code unit_price_with_vat}/{@code vat_amount}
 *       는 {@code NUMERIC(15,2)}(정수부 13자리 한계)인데 R1 가드는 정수부 15자리까지 통과시켰다.
 *       게다가 실패는 입력값(단가) 자체가 아니라 파생값({@code 단가×1.1=VAT 포함 단가})에서
 *       난다 — 13자리 단가도 ×1.1 하면 14자리가 될 수 있다.</li>
 * </ol>
 * 도메인 단위 테스트({@code SlipLineAmountOverflowTest})는 이 IT 와 쌍을 이루는 sweep 이며,
 * 이 클래스만이 "실 요청 경로 + 실 Postgres NUMERIC 컬럼"을 함께 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipLineAmountOverflowControllerIT extends AbstractPostgresIT {

    @Autowired
    private org.springframework.test.web.servlet.MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    private Map<String, Object> baseBody(Map<String, Object> line) {
        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-07-22");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", "DAY");
        body.put("memo", "MED-4 R2 IT");
        body.put("lines", List.of(line));
        return body;
    }

    private Map<String, Object> plainLine(String unitPrice) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", unitPrice);
        line.put("note", "MED-4 R2");
        return line;
    }

    /**
     * PM 실측 그대로: 단가 9,999,999,999,999(13자리) — 단가 자체는 NUMERIC(15,2) 한계 안이지만
     * ×1.1 파생 VAT 포함 단가가 14자리가 되어 {@code unit_price_with_vat} 컬럼에서 overflow.
     * priceVatInclusive 미전송(기본값) → {@code SlipLine.create()} 평문 경로.
     */
    @Test
    @DisplayName("PM 실측 재현: 13자리 단가(파생 VAT포함단가 14자리) → 500 아닌 400 INVALID_INPUT")
    void thirteenDigitUnitPrice_rejectedAsBadRequest_notServerError() throws Exception {
        Map<String, Object> body = baseBody(plainLine("9999999999999"));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    /**
     * PM 실측 18자리(1E+17) 케이스 — priceVatInclusive=true 로 {@code createFromVatInclusive}
     * 경로도 동일하게 실 Postgres 에서 재현.
     */
    @Test
    @DisplayName("PM 실측 재현: VAT포함단가 18자리(1E+17) → 500 아닌 400 INVALID_INPUT")
    void hugeVatInclusiveUnitPrice_rejectedAsBadRequest_notServerError() throws Exception {
        Map<String, Object> line = plainLine("100000000000000000");
        line.put("priceVatInclusive", true);
        Map<String, Object> body = baseBody(line);

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    /**
     * D-3 이후에는 요청 단가를 역산하지 않으므로 공급가액 15자리도 wide 컬럼에 그대로
     * 저장된다. 예전에는 공급가액에서 파생한 narrow 단가가 overflow를 일으켰지만,
     * 입력 단가가 narrow 범위 안이면 공급가액 자체의 wide 컬럼 범위까지 허용한다.
     */
    @Test
    @DisplayName("D-3: quantity=1 · 15자리 공급가액은 입력 단가를 보존하며 201 CREATED")
    void fifteenDigitSupplyAtQuantityOne_acceptedWithPreservedUnitPrice() throws Exception {
        Map<String, Object> line = plainLine("1");
        line.put("supplyAmount", "999999999999999");
        line.put("vatAmount", "0");
        line.put("lineTotalWithVat", "999999999999999");
        Map<String, Object> body = baseBody(line);

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].unitPrice").value(1.0))
                .andExpect(jsonPath("$.data.lines[0].unitPriceWithVat").value(1.0))
                .andExpect(jsonPath("$.data.lines[0].supplyAmount").value(999999999999999.0))
                .andExpect(jsonPath("$.data.lines[0].vatAmount").value(0.0))
                .andExpect(jsonPath("$.data.lines[0].lineTotal").value(999999999999999.0));
    }

    /**
     * D-3의 핵심 왕복 — 저장 응답과 상세 재조회 모두 입력 단가 11,000과 화면의 S/V를
     * 그대로 반환해야 하며, S/Q 또는 T/Q 역산값 25,000/26,000을 만들면 안 된다.
     */
    @Test
    @DisplayName("D-3: 입력 단가와 S/V/T를 저장 후 상세 재조회에서도 보존")
    void authoritativeAmounts_roundTrip_preservesEnteredUnitPrice() throws Exception {
        UUID accountId = UUID.randomUUID();
        Map<String, Object> line = plainLine("11000");
        line.put("quantity", 2);
        line.put("supplyAmount", "50000");
        line.put("vatAmount", "2000");
        line.put("lineTotalWithVat", "52000");
        Map<String, Object> body = baseBody(line);

        String response = mockMvc.perform(post("/slips")
                        .header("X-User-Id", accountId.toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].unitPrice").value(11000.0))
                .andExpect(jsonPath("$.data.lines[0].unitPriceWithVat").value(11000.0))
                .andExpect(jsonPath("$.data.lines[0].supplyAmount").value(50000.0))
                .andExpect(jsonPath("$.data.lines[0].vatAmount").value(2000.0))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String slipId = objectMapper.readTree(response).path("data").path("id").asText();

        mockMvc.perform(get("/slips/" + slipId)
                        .header("X-User-Id", accountId.toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].unitPrice").value(11000.0))
                .andExpect(jsonPath("$.data.lines[0].unitPriceWithVat").value(11000.0))
                .andExpect(jsonPath("$.data.lines[0].supplyAmount").value(50000.0))
                .andExpect(jsonPath("$.data.lines[0].vatAmount").value(2000.0))
                .andExpect(jsonPath("$.data.lines[0].lineTotal").value(50000.0));
    }

    /**
     * 정상 업무 범위 회귀 방지 — 실 Postgres 저장까지 201 CREATED 로 성공해야 한다
     * (과도하게 좁힌 가드가 정상 입력까지 막지 않는지 실 경로로 확인).
     */
    @Test
    @DisplayName("정상 업무 범위(수십억 단가)는 실 Postgres 저장까지 201 CREATED")
    void normalBusinessRangeUnitPrice_stillPersists() throws Exception {
        Map<String, Object> body = baseBody(plainLine("2500000000"));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"));
    }
}
