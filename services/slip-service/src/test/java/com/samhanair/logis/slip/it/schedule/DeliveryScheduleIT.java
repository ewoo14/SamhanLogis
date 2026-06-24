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
import com.samhanair.logis.slip.domain.schedule.DeliverySchedule;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
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
 * <p>날짜 고정: CI flaky 방지를 위해 {@code LocalDate.now()} 동적 날짜 대신 고정 미래 날짜 사용.
 * <ul>
 *   <li>수요일 고정: {@code 2027-03-10} (수요일)</li>
 *   <li>토요일 고정: {@code 2027-03-13} (토요일)</li>
 * </ul>
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>지방 평일(수요일) 생성 → unloadDate = 목요일(익일), label = "10상11하"</li>
 *   <li>지방 토요일 생성 → unloadDate = 월요일 (일요일 skip)</li>
 *   <li>야적 토요일 생성 → unloadDate = 일요일 (야적&amp;&amp;토 예외 — 일요일 유지)</li>
 *   <li>editHeader 배송태그 지방 확정 → unloadDate 재계산</li>
 *   <li>unloadDate override 당착(slipDate) 전달 → label = "당착"</li>
 *   <li>비적용 태그(DAY) → unloadDate null, label null</li>
 *   <li>editHeader 태그 미변경 + 당착 N 편집 → unloadDate == slipDate, label = "당착"</li>
 * </ol>
 *
 * <p>외부 client 격리: {@link ProductClient} / {@link InventoryClient} /
 * {@link UserInternalClient} / {@link WarehouseInternalClient} /
 * {@link PartnerInternalClient} 전부 {@code @MockBean} + lenient stub.
 * {@code ApprovalLineAuthorizeClient} / {@code DynamicPermissionClient} 는
 * {@link AbstractPostgresIT} 에서 공통 등록.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DeliveryScheduleIT extends AbstractPostgresIT {

    /** 수요일 고정 — 요일/컷오프 flaky 방지. 2027-03-10 = 수요일. */
    private static final LocalDate FIXED_WEDNESDAY = LocalDate.of(2027, 3, 10);
    /** 토요일 고정 — 2027-03-13 = 토요일. */
    private static final LocalDate FIXED_SATURDAY = LocalDate.of(2027, 3, 13);

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
    // 시나리오 1: 지방 수요일 → unloadDate = 목요일(익일), label = "10상11하"
    // -------------------------------------------------------------------------
    @Test
    void 지방_평일_생성_하차일_익일_라벨() throws Exception {
        // 수요일(2027-03-10) → 목요일(2027-03-11)
        LocalDate slipDate = FIXED_WEDNESDAY;
        LocalDate expectedUnload = slipDate.plusDays(1); // 2027-03-11(목요일)
        String expectedLabel = slipDate.getDayOfMonth() + "상" + expectedUnload.getDayOfMonth() + "하"; // "10상11하"

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
        // 토요일(2027-03-13) → N = 일요일(03-14) → skip → 월요일(03-15)
        LocalDate slipDate = FIXED_SATURDAY;
        LocalDate expectedUnload = slipDate.plusDays(2); // 2027-03-15(월요일)
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
        // 야적 토요일(2027-03-13) → N = 일요일(03-14) — 야적&&토 예외이므로 일요일 그대로
        LocalDate slipDate = FIXED_SATURDAY;
        LocalDate expectedUnload = slipDate.plusDays(1); // 2027-03-14(일요일 유지)
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
        LocalDate slipDate = FIXED_WEDNESDAY;

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
        LocalDate slipDate = FIXED_WEDNESDAY;

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
        LocalDate slipDate = FIXED_WEDNESDAY;
        MvcResult created = 전표_생성(null, slipDate, null);
        JsonNode initialData = responseData(created);
        String slipId = initialData.get("id").asText();
        // 태그 미지정 → unloadDate null
        Assertions.assertThat(initialData.get("unloadDate").isNull()).isTrue();

        // 2) editHeader 지방 태그 설정 → unloadDate = 익일(목요일)
        LocalDate expectedUnload = slipDate.plusDays(1); // 2027-03-11(목요일)
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
    // 시나리오 7: editHeader 태그 미변경 + N 편집(당착: unloadDate=slipDate)
    // -------------------------------------------------------------------------
    @Test
    void editHeader_태그미변경_당착편집_label_당착() throws Exception {
        // 1) 지방(REGION) 태그로 전표 생성 → unloadDate = 익일(목요일)
        LocalDate slipDate = FIXED_WEDNESDAY;
        MvcResult created = 전표_생성("REGION", slipDate, null);
        JsonNode initialData = responseData(created);
        String slipId = initialData.get("id").asText();
        // 초기 unloadDate = 익일
        Assertions.assertThat(initialData.get("unloadDate").asText())
                .isEqualTo(slipDate.plusDays(1).toString());

        // 2) editHeader: deliveryTag 미전달(null=유지), unloadDate = slipDate(당착 지정)
        Map<String, Object> headerBody = new HashMap<>();
        headerBody.put("unloadDate", slipDate.toString()); // 당착: N = M

        MvcResult editResult = mockMvc.perform(
                        patch("/slips/" + slipId + "/header")
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "SALES")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(headerBody)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode editData = responseData(editResult);
        // unloadDate == slipDate (당착)
        Assertions.assertThat(editData.get("unloadDate").asText())
                .isEqualTo(slipDate.toString());
        // label = "당착"
        Assertions.assertThat(editData.get("deliveryScheduleLabel").asText())
                .isEqualTo("당착");
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
}
