package com.samhanair.logis.slip.it.schedule;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.assertj.core.api.Assertions;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * 출고전표 배송일정(M상N하) 통합 테스트 — V52 unload_date 구조화 필드 + 파생 라벨.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>지방 평일 생성 → unloadDate = 익일, label = "N1상N2하"</li>
 *   <li>지방 토요일 생성 → unloadDate = 월요일 (일요일 skip)</li>
 *   <li>야적 토요일 생성 → unloadDate = 일요일 (야적&amp;&amp;토 예외 — 일요일 유지)</li>
 *   <li>editHeader 배송태그 지방 확정 → unloadDate 재계산</li>
 *   <li>unloadDate override 당착(slipDate) 전달 → label = "당착"</li>
 *   <li>비적용 태그(DAY) → unloadDate null, label null</li>
 * </ol>
 *
 * <p>외부 client 격리: {@link ProductClient} / {@link InventoryClient} /
 * {@link UserInternalClient} / {@link WarehouseInternalClient} /
 * {@link PartnerInternalClient} 전부 {@code @MockBean} + lenient stub.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DeliveryScheduleIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-SCHED",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-SCHED",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(partnerInternalClient.resolvePartnerCode(ArgumentMatchers.any()))
                .thenReturn(Optional.empty());
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.skipped(Optional.empty()));
    }

    // -------------------------------------------------------------------------
    // 시나리오 1: 지방 평일 → unloadDate = 익일, label = "N1상N2하"
    // -------------------------------------------------------------------------
    @Test
    void 지방_평일_생성_하차일_익일_라벨() throws Exception {
        // 수요일 고정 (주말 영향 없음)
        LocalDate slipDate = nextWeekday(DayOfWeek.WEDNESDAY);
        LocalDate expectedUnload = slipDate.plusDays(1);
        String expectedLabel = slipDate.getDayOfMonth() + "상" + expectedUnload.getDayOfMonth() + "하";

        MvcResult result = 전표_생성("REGION", slipDate, null);

        JsonNode data = responseData(result);
        Assertions.assertThat(data.get("unloadDate").asText())
                .isEqualTo(expectedUnload.toString());
        Assertions.assertThat(data.get("deliveryScheduleLabel").asText())
                .isEqualTo(expectedLabel);
    }

    // -------------------------------------------------------------------------
    // 시나리오 2: 지방 토요일 → unloadDate = 월요일 (일요일 skip)
    // -------------------------------------------------------------------------
    @Test
    void 지방_토요일_생성_하차일_월요일() throws Exception {
        LocalDate slipDate = nextWeekday(DayOfWeek.SATURDAY);
        // N = 일요일 → skip → 월요일
        LocalDate expectedUnload = slipDate.plusDays(2);
        String expectedLabel = slipDate.getDayOfMonth() + "상" + expectedUnload.getDayOfMonth() + "하";

        MvcResult result = 전표_생성("REGION", slipDate, null);

        JsonNode data = responseData(result);
        Assertions.assertThat(data.get("unloadDate").asText())
                .isEqualTo(expectedUnload.toString());
        Assertions.assertThat(data.get("deliveryScheduleLabel").asText())
                .isEqualTo(expectedLabel);
    }

    // -------------------------------------------------------------------------
    // 시나리오 3: 야적 토요일 → unloadDate = 일요일 (야적&&토 예외 — 일요일 유지)
    // -------------------------------------------------------------------------
    @Test
    void 야적_토요일_생성_하차일_일요일유지() throws Exception {
        LocalDate slipDate = nextWeekday(DayOfWeek.SATURDAY);
        LocalDate expectedUnload = slipDate.plusDays(1); // 일요일 그대로
        String expectedLabel = slipDate.getDayOfMonth() + "상" + expectedUnload.getDayOfMonth() + "하";

        MvcResult result = 전표_생성("STACK", slipDate, null);

        JsonNode data = responseData(result);
        Assertions.assertThat(data.get("unloadDate").asText())
                .isEqualTo(expectedUnload.toString());
        Assertions.assertThat(data.get("deliveryScheduleLabel").asText())
                .isEqualTo(expectedLabel);
    }

    // -------------------------------------------------------------------------
    // 시나리오 4: DAY 태그 생성 → unloadDate null, label null (비적용 태그)
    // -------------------------------------------------------------------------
    @Test
    void 비적용태그_하차일_null() throws Exception {
        LocalDate slipDate = nextWeekday(DayOfWeek.WEDNESDAY);

        MvcResult result = 전표_생성("DAY", slipDate, null);

        JsonNode data = responseData(result);
        Assertions.assertThat(data.get("unloadDate").isNull()).isTrue();
        Assertions.assertThat(data.get("deliveryScheduleLabel").isNull()).isTrue();
    }

    // -------------------------------------------------------------------------
    // 시나리오 5: unloadDate override = slipDate(당착) → label = "당착"
    // -------------------------------------------------------------------------
    @Test
    void 지방_당착_override_라벨() throws Exception {
        LocalDate slipDate = nextWeekday(DayOfWeek.WEDNESDAY);

        // override = slipDate (당착: N == M)
        MvcResult result = 전표_생성("REGION", slipDate, slipDate);

        JsonNode data = responseData(result);
        Assertions.assertThat(data.get("unloadDate").asText())
                .isEqualTo(slipDate.toString());
        Assertions.assertThat(data.get("deliveryScheduleLabel").asText())
                .isEqualTo("당착");
    }

    // -------------------------------------------------------------------------
    // 시나리오 6: editHeader 로 지방 태그 설정 → unloadDate 재계산
    // -------------------------------------------------------------------------
    @Test
    void editHeader_지방태그_설정_하차일_재계산() throws Exception {
        // 1) 태그 없이 생성 (unloadDate null)
        LocalDate slipDate = nextWeekday(DayOfWeek.WEDNESDAY);
        MvcResult created = 전표_생성(null, slipDate, null);
        JsonNode initialData = responseData(created);
        String slipId = initialData.get("id").asText();
        // 태그 미지정 → unloadDate null
        Assertions.assertThat(initialData.get("unloadDate").isNull()).isTrue();

        // 2) editHeader 지방 태그 설정
        LocalDate expectedUnload = slipDate.plusDays(1);
        String expectedLabel = slipDate.getDayOfMonth() + "상" + expectedUnload.getDayOfMonth() + "하";

        Map<String, Object> headerBody = new HashMap<>();
        headerBody.put("deliveryTag", "REGION");

        MvcResult editResult = mockMvc.perform(
                        patch("/slips/" + slipId + "/header")
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "SALES")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(headerBody)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode editData = responseData(editResult);
        Assertions.assertThat(editData.get("unloadDate").asText())
                .isEqualTo(expectedUnload.toString());
        Assertions.assertThat(editData.get("deliveryScheduleLabel").asText())
                .isEqualTo(expectedLabel);
    }

    // -------------------------------------------------------------------------
    // 헬퍼 메서드
    // -------------------------------------------------------------------------

    /**
     * 출고전표 POST /slips 요청 헬퍼.
     *
     * @param deliveryTag 배송 태그 (null 이면 태그 없음)
     * @param slipDate 전표 날짜
     * @param unloadDate 하차일 override (null 이면 규칙 자동 계산)
     */
    private MvcResult 전표_생성(String deliveryTag, LocalDate slipDate, LocalDate unloadDate)
            throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-SCHED");
        line.put("quantity", 1);
        line.put("unitPrice", 10000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", slipDate.toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("lines", List.of(line));
        if (deliveryTag != null) {
            body.put("deliveryTag", deliveryTag);
        }
        if (unloadDate != null) {
            body.put("unloadDate", unloadDate.toString());
        }

        return mockMvc.perform(
                        post("/slips")
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "SALES")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    /**
     * ApiResponse wrapper의 data 노드 추출.
     */
    private JsonNode responseData(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return objectMapper.readTree(body).get("data");
    }

    /**
     * 주어진 요일에 해당하는 가장 가까운 미래 날짜 반환.
     * 테스트 날짜 고정을 위해 올해 기준 계산.
     */
    private LocalDate nextWeekday(DayOfWeek dayOfWeek) {
        LocalDate today = LocalDate.now();
        int daysUntil = (dayOfWeek.getValue() - today.getDayOfWeek().getValue() + 7) % 7;
        return today.plusDays(daysUntil == 0 ? 7 : daysUntil);
    }
}
