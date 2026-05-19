package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * SlipSalesQueryController IT — audit Slice 2 P0.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>X-Internal-Token 헤더 없으면 403</li>
 *   <li>from 파라미터 누락 시 400</li>
 *   <li>to 파라미터 누락 시 400</li>
 *   <li>기간 내 슬립 없으면 빈 content + last=true</li>
 *   <li>CONFIRMED OUTBOUND 슬립 → content 포함 + 핵심 필드 검증 + UUID 비공개 가드</li>
 *   <li>partnerCode 필터 — 일치 슬립만 반환</li>
 *   <li>partnerCode 필터 — 불일치 시 빈 결과</li>
 *   <li>기간 외 슬립 미포함</li>
 *   <li>DRAFT 슬립 (CONFIRMED 아님) 미포함 — silent failure 방지 핵심</li>
 * </ol>
 *
 * <p>외부 RestClient @MockBean 격리 의무 (feedback_it_mockbean_external_clients.md):
 * InventoryClient / ProductClient / UserInternalClient / WarehouseInternalClient /
 * PartnerInternalClient / ArologisDispatchClient
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipSalesQueryControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String SALES_QUERY_URL = "/internal/slips/sales-query";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private EntityManager entityManager;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private UserInternalClient userInternalClient;
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void stubExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(Mockito.any()))
                .thenReturn(Optional.empty());
    }

    // =========================================================================
    // 시나리오 1~2: 인증/파라미터 검증
    // =========================================================================

    /**
     * 시나리오 1: X-Internal-Token 미제공 시 403.
     *
     * <p>SecurityConfig 의 InternalTokenFilter 가 /internal/** 경로에 적용됨 검증.
     */
    @Test
    void scenario1_withoutInternalToken_returns403() throws Exception {
        mockMvc.perform(get(SALES_QUERY_URL)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31"))
                .andExpect(status().isForbidden());
    }

    /**
     * 시나리오 2: from 파라미터 누락 시 400.
     */
    @Test
    void scenario2_missingFrom_returns400() throws Exception {
        mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("to", "2026-05-31"))
                .andExpect(status().isBadRequest());
    }

    /**
     * 시나리오 3: to 파라미터 누락 시 400.
     */
    @Test
    void scenario3_missingTo_returns400() throws Exception {
        mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01"))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // 시나리오 4: 빈 결과
    // =========================================================================

    /**
     * 시나리오 4: 기간 내 CONFIRMED OUTBOUND 슬립 없으면 빈 content + last=true.
     */
    @Test
    void scenario4_noSlipsInPeriod_returnsEmptyContent() throws Exception {
        mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-01-01")
                        .param("to", "2026-01-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.last").value(true))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    // =========================================================================
    // 시나리오 5: 정상 조회 + 핵심 필드 검증
    // =========================================================================

    /**
     * 시나리오 5: CONFIRMED OUTBOUND 슬립 → content 포함 + 핵심 필드 검증 + UUID 비공개 가드.
     */
    @Test
    void scenario5_confirmedOutboundSlip_appearsInContent() throws Exception {
        // given
        Slip slip = createAndPersistConfirmedOutbound("A001", "테스트거래처A", LocalDate.of(2026, 5, 15));

        // when
        MvcResult result = mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31"))
                .andExpect(status().isOk())
                .andReturn();

        // then
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data");
        JsonNode content = data.get("content");
        assertThat(content).hasSizeGreaterThanOrEqualTo(1);

        // A001 파트너의 row 찾기
        JsonNode row = null;
        for (JsonNode r : content) {
            if ("A001".equals(r.get("partnerCode").asText())) {
                row = r;
                break;
            }
        }
        assertThat(row).isNotNull();
        assertThat(row.get("partnerName").asText()).isEqualTo("테스트거래처A");
        assertThat(row.get("slipDate").asText()).isEqualTo("2026-05-15");
        assertThat(row.get("accountingDate").asText()).isNotBlank(); // CONFIRMED → confirmedAt 기반

        // UUID 비공개 가드 — slipId / id 미포함
        assertThat(row.has("slipId")).isFalse();
        assertThat(row.has("id")).isFalse();
    }

    // =========================================================================
    // 시나리오 6~7: partnerCode 필터
    // =========================================================================

    /**
     * 시나리오 6: partnerCode 필터 — 일치하는 슬립만 반환.
     */
    @Test
    void scenario6_partnerCodeFilter_returnsOnlyMatchingSlips() throws Exception {
        // given
        createAndPersistConfirmedOutbound("PC_ALPHA", "알파거래처", LocalDate.of(2026, 5, 10));
        createAndPersistConfirmedOutbound("PC_BETA", "베타거래처", LocalDate.of(2026, 5, 11));

        // when — PC_ALPHA 만 필터
        MvcResult result = mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .param("partnerCode", "PC_ALPHA"))
                .andExpect(status().isOk())
                .andReturn();

        // then — PC_ALPHA 만 포함
        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("data").get("content");
        for (JsonNode row : content) {
            assertThat(row.get("partnerCode").asText()).isEqualTo("PC_ALPHA");
        }
        assertThat(content.size()).isGreaterThanOrEqualTo(1);
    }

    /**
     * 시나리오 7: partnerCode 필터 — 불일치 시 빈 결과.
     */
    @Test
    void scenario7_partnerCodeFilter_noMatch_returnsEmpty() throws Exception {
        // given
        createAndPersistConfirmedOutbound("PC_EXISTS", "기존거래처", LocalDate.of(2026, 5, 5));

        // when
        mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .param("partnerCode", "PC_NOT_EXIST"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.last").value(true));
    }

    // =========================================================================
    // 시나리오 8~9: 필터 경계 검증 (silent failure 방지)
    // =========================================================================

    /**
     * 시나리오 8: 기간 외 슬립은 미포함.
     */
    @Test
    void scenario8_slipOutsidePeriod_notIncluded() throws Exception {
        // given — 4월 슬립 (5월 조회 범위 외)
        String uniqueCode = "OOR-" + System.nanoTime();
        createAndPersistConfirmedOutbound(uniqueCode, "범위외거래처", LocalDate.of(2026, 4, 30));

        // when — 5월만 조회
        MvcResult result = mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31"))
                .andExpect(status().isOk())
                .andReturn();

        // then — 4월 슬립 미포함
        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("data").get("content");
        for (JsonNode row : content) {
            assertThat(row.get("partnerCode").asText()).isNotEqualTo(uniqueCode);
        }
    }

    /**
     * 시나리오 9: DRAFT 슬립은 미포함 — silent failure 방지 핵심 검증.
     *
     * <p>기존 결함 재현: slip-service 에 endpoint 미존재 → 4xx → 빈 결과.
     * 본 테스트는 endpoint 존재 + DRAFT 제외 + CONFIRMED 만 포함 정책을 검증한다.
     */
    @Test
    void scenario9_draftSlip_notIncluded() throws Exception {
        // given — DRAFT 슬립 (CONFIRMED 전이 없이 저장)
        String draftCode = "DRAFT-" + System.nanoTime();
        Slip draft = Slip.createOutbound(
                "2026/05/20-DRAFT",
                LocalDate.of(2026, 5, 20),
                99,
                UUID.randomUUID(),   // sourceWarehouseId
                UUID.randomUUID(),   // destinationWarehouseId
                UUID.randomUUID(),   // partnerId
                "드래프트거래처",
                null,
                "드래프트 메모",
                "tester");
        // partnerCode 는 updateSalesHeader 로 설정 (OUTBOUND + DRAFT 상태에서 호출 가능)
        draft.updateSalesHeader("드래프트거래처", draftCode, null, null, null, null, null, null, null);
        slipRepository.saveAndFlush(draft);

        // when — 5월 조회
        MvcResult result = mockMvc.perform(get(SALES_QUERY_URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31"))
                .andExpect(status().isOk())
                .andReturn();

        // then — DRAFT 슬립 미포함
        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("data").get("content");
        for (JsonNode row : content) {
            assertThat(row.get("partnerCode").asText()).isNotEqualTo(draftCode);
        }
    }

    // =========================================================================
    // 내부 헬퍼
    // =========================================================================

    /**
     * CONFIRMED OUTBOUND 슬립을 생성하여 DB 에 직접 저장.
     *
     * <p>도메인 상태전이 경로 (DRAFT → ... → CONFIRMED) 는 IT 에서 재현하기 복잡하므로,
     * 엔티티 저장 후 JPQL UPDATE 로 status = CONFIRMED + confirmedAt 을 직접 설정한다.
     * IT 전용 패턴 (production 코드에서 직접 상태 변경 금지).
     *
     * @param partnerCode 거래처코드
     * @param partnerName 거래처명
     * @param slipDate    전표 날짜
     * @return 저장된 슬립 (refresh 후 반환)
     */
    private Slip createAndPersistConfirmedOutbound(String partnerCode, String partnerName,
                                                    LocalDate slipDate) {
        String slipNo = slipDate.toString().replace("-", "/") + "-" + System.nanoTime() % 100000;
        Slip slip = Slip.createOutbound(
                slipNo,
                slipDate,
                1,
                UUID.randomUUID(),   // sourceWarehouseId
                UUID.randomUUID(),   // destinationWarehouseId
                UUID.randomUUID(),   // partnerId
                partnerName,
                null,
                "테스트 메모",
                "tester");

        // partnerCode 직접 설정 (updateSalesHeader — OUTBOUND + DRAFT 허용)
        slip.updateSalesHeader(partnerName, partnerCode, null, null, null, null, null, null, null);

        Slip saved = slipRepository.saveAndFlush(slip);
        entityManager.flush();

        // JPQL UPDATE 로 status + confirmedAt 직접 설정 (IT 전용 패턴)
        entityManager.createQuery(
                        "UPDATE Slip s SET s.status = :status, s.confirmedAt = :confirmedAt" +
                        " WHERE s.id = :id")
                .setParameter("status", com.samhanair.logis.slip.domain.SlipStatus.CONFIRMED)
                .setParameter("confirmedAt", LocalDateTime.of(slipDate, java.time.LocalTime.NOON))
                .setParameter("id", saved.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.refresh(saved);

        return saved;
    }
}
