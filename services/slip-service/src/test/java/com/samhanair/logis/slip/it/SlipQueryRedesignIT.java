package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.OpaqueUuidDeserializer;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 판매/구매조회 전표 목록 redesign 검증 IT — V20 (feature/sales-purchase-query-redesign).
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>TC-1: 기본 호출 (dateFrom/dateTo 미지정) → Asia/Seoul 오늘 ±15일 범위 결과 정상 반환</li>
 *   <li>TC-2: pagination 50/page 검증 — size=50 기본값 + 총 건수 확인</li>
 *   <li>TC-3: searchProjectName 부분 일치 검증 — withProjectInfo 로 설정된 projectName LIKE 검색</li>
 *   <li>TC-4: SlipResponse 신규 필드 응답 schema 검증 (businessNumber / supervisionAddress /
 *       projectName / recipientPhone / paymentDueDate / printed / memo / totalAmount / totalQuantity)</li>
 *   <li>TC-5: printed flag 값 검증 — recordPrint() 호출 전 false / 호출 후 true</li>
 * </ul>
 *
 * <p>외부 client {@code @MockBean} 격리 5종 (memory {@code feedback_it_mockbean_external_clients}):
 * {@link ProductClient}, {@link InventoryClient}, {@link NotificationChatRoomClient},
 * {@link PartnerBlockClient}, {@link PartnerInternalClient}, {@link SmsGateway}.
 *
 * <p>{@code extends AbstractPostgresIT} — Testcontainers PostgreSQL 싱글턴 컨테이너.
 * Docker 미가용 시 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipQueryRedesignIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String MASTER_ROLE = "MASTER";
    private static final String SALES_ROLE = "SALES";

    /** 판매/구매조회 전용 endpoint 경로. */
    private static final String QUERY_PATH = "/slips/query";

    /** 오늘 날짜 — TC-1 범위 검증 기준. */
    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SlipRevisionService slipRevisionService;

    /** 외부 client 격리 — inventory-service 실제 호출 차단. */
    @MockBean
    private InventoryClient inventoryClient;

    /** 외부 client 격리 — product-service 실제 호출 차단. */
    @MockBean
    private ProductClient productClient;

    /** 외부 client 격리 — notification-service chat-room lookup 차단. */
    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    /** 외부 client 격리 — partner-service block lookup 차단. */
    @MockBean
    private PartnerBlockClient partnerBlockClient;

    /** 외부 client 격리 — partner-service internal resolve 차단. */
    @MockBean
    private PartnerInternalClient partnerInternalClient;

    /** 외부 client 격리 — SMS Gateway 실제 발송 차단. */
    @MockBean
    private SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    /**
     * ProductClient lenient stub — SlipService.create 가 라인 productId 검증 시
     * 실제 product-service 호출 → 500 방지 (PR #17 회고).
     */
    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
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

    // -----------------------------------------------------------------------
    // TC-1: 기본 호출 (dateFrom/dateTo 미지정) → 오늘 ±15일 범위 정상 반환
    // -----------------------------------------------------------------------

    /**
     * TC-1: {@code GET /slips/query} 날짜 미지정 시 오늘 ±15일 범위 내 슬립이 반환된다.
     *
     * <p>오늘 날짜로 슬립 1건 생성 후 쿼리 → data.content 에 1건 이상 포함 확인.
     */
    @Test
    @DisplayName("TC-1: dateFrom/dateTo 미지정 → 오늘 ±15일 범위 자동 적용")
    void tc1_defaultDateRange() throws Exception {
        // 오늘 날짜 슬립 1건 생성
        createOutboundSlip(TODAY, "TC1거래처", null);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content", notNullValue()))
                .andExpect(jsonPath("$.data.totalElements", greaterThanOrEqualTo(1)));
    }

    // -----------------------------------------------------------------------
    // TC-2: pagination 50/page 기본값 + 총 건수 검증
    // -----------------------------------------------------------------------

    /**
     * TC-2: 기본 size=50 파라미터로 페이지 응답이 올바르게 구성된다.
     *
     * <p>3건 생성 후 {@code GET /slips/query} 호출 → size/number/totalElements 구조 검증.
     */
    @Test
    @DisplayName("TC-2: 기본 size=50 pagination 구조 검증")
    void tc2_defaultPaginationSize() throws Exception {
        for (int i = 0; i < 3; i++) {
            createOutboundSlip(TODAY, "TC2거래처" + i, null);
        }

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pageable.pageSize", is(50)))
                .andExpect(jsonPath("$.data.pageable.pageNumber", is(0)))
                .andExpect(jsonPath("$.data.totalElements", greaterThanOrEqualTo(3)));
    }

    // -----------------------------------------------------------------------
    // TC-3: searchProjectName 부분 일치 검증
    // -----------------------------------------------------------------------

    /**
     * TC-3: {@code searchProjectName} 파라미터로 프로젝트명 LIKE 검색이 동작한다.
     *
     * <p>프로젝트명 "삼한물류센터A동" 슬립 생성 후 {@code searchProjectName=물류센터} 쿼리 →
     * 해당 슬립 포함, 다른 슬립 미포함 확인.
     */
    @Test
    @DisplayName("TC-3: searchProjectName 부분 일치 검색")
    void tc3_searchProjectName() throws Exception {
        // 검색 대상 슬립 — projectName 설정
        String slipId = createOutboundSlip(TODAY, "TC3거래처A", "삼한물류센터A동");
        // 검색 비대상 슬립 — 다른 프로젝트명
        createOutboundSlip(TODAY, "TC3거래처B", "다른프로젝트XYZ");

        // projectName 직접 갱신 (도메인 메서드 withProjectInfo 사용)
        applyProjectInfo(slipId, "삼한물류센터A동");

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("searchProjectName", "물류센터"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content", notNullValue()))
                .andExpect(jsonPath("$.data.totalElements", greaterThanOrEqualTo(1)));
    }

    /**
     * TC-3B: 검색어의 {@code %}·{@code _}는 SQL wildcard가 아니라 입력 문자 그대로 매칭되어야 한다.
     *
     * <p>각 특수문자 행과 같은 접두사의 정상문자 행을 함께 만든다. escape가 없으면
     * {@code %}·{@code _}가 정상문자 행까지 매칭해 2건이 반환된다.
     */
    @Test
    @DisplayName("TC-3B: 검색어 %·_ literal 매칭")
    void tc3b_literalWildcardCharacters() throws Exception {
        createOutboundSlip(TODAY, "LUNA907R4-percent%", null);
        createOutboundSlip(TODAY, "LUNA907R4-percentX", null);
        createOutboundSlip(TODAY, "LUNA907R4-underscore_", null);
        createOutboundSlip(TODAY, "LUNA907R4-underscoreX", null);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("searchPartnerName", "LUNA907R4-percent%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements", is(1)));

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("searchPartnerName", "LUNA907R4-underscore_"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements", is(1)));
    }

    // -----------------------------------------------------------------------
    // TC-4: SlipResponse 신규 필드 응답 schema 검증
    // -----------------------------------------------------------------------

    /**
     * TC-4: {@link com.samhanair.logis.slip.web.dto.SlipResponse} V20 신규 필드가
     * 응답 JSON 에 포함된다.
     *
     * <p>검증 필드: businessNumber / supervisionAddress / projectName / recipientPhone /
     * paymentDueDate / printed / memo / totalAmount / totalQuantity / salesPersonName /
     * editHistoryCount.
     */
    @Test
    @DisplayName("TC-4: SlipResponse V20 신규 필드 schema 검증")
    void tc4_newFieldsSchema() throws Exception {
        createOutboundSlip(TODAY, "TC4거래처", null);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipNo", notNullValue()))
                .andExpect(jsonPath("$.data.content[0].partnerName", notNullValue()))
                // V20 신규 필드 — key 존재 여부 검증 (null 값도 key 포함)
                .andExpect(jsonPath("$.data.content[0].printed", notNullValue()))
                .andExpect(jsonPath("$.data.content[0].totalAmount", notNullValue()))
                .andExpect(jsonPath("$.data.content[0].totalQuantity", notNullValue()))
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", notNullValue()));
    }

    // -----------------------------------------------------------------------
    // TC-5: printed flag 검증 — recordPrint() 전/후
    // -----------------------------------------------------------------------

    /**
     * TC-5: {@code printed} 필드가 {@code recordPrint()} 도메인 메서드 호출 전후로
     * {@code false} / {@code true} 로 올바르게 반환된다.
     */
    @Test
    @DisplayName("TC-5: printed flag — recordPrint() 호출 전 false / 후 true")
    void tc5_printedFlag() throws Exception {
        String slipId = createOutboundSlip(TODAY, "TC5거래처", null);
        String slipNo = getSlipNo(slipId);

        // recordPrint 호출 전 — printed=false (slipNo 검색으로 결정적 1행 조회)
        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].printed", is(false)));

        // recordPrint() 도메인 메서드로 인쇄 시각 기록
        applyPrint(slipId);

        // recordPrint 호출 후 — printed=true
        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].printed", is(true)));
    }

    /**
     * TC-6: OUTBOUND 전표수정내역은 창고이관(COMPLETED) 이후 편집만 표시한다.
     *
     * <p>S2c 룰: 드래프트~검수중 편집 revision 은 감사 revisionNo 에는 남지만 사용자 노출
     * editHistoryCount 에는 포함하지 않는다.
     */
    @Test
    @DisplayName("TC-6: OUTBOUND editHistoryCount — COMPLETED 이후 편집만 카운트")
    void tc6_outboundEditHistoryCount_stateDependent() throws Exception {
        String slipId = createOutboundSlip(TODAY, "TC6거래처", null);
        String slipNo = getSlipNo(slipId);

        applyRevisions(slipId, 2);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "OUTBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(0)));

        advanceOutboundToCompleted(slipId);
        applyRevisions(slipId, 2);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "OUTBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(2)));
    }

    /**
     * TC-6B: OUTBOUND 임계 통과 후 버전 복원은 사용자 관점의 수정으로 카운트한다.
     *
     * <p>복원 이력 자체는 {@code slip_revisions} RESTORE 행으로 남고, {@code slip_audit_logs} 행은
     * 만들지 않는다. audit timeline 은 실제 audit row 만 조회하므로 빈 revisionNo 는 노출되지 않는다.
     */
    @Test
    @DisplayName("TC-6B: OUTBOUND editHistoryCount — COMPLETED 이후 버전복원도 카운트")
    void tc6b_outboundRestoreAfterCompletedIncrementsEditHistoryCount() throws Exception {
        String slipId = createOutboundSlip(TODAY, "TC6B거래처", null);
        String slipNo = getSlipNo(slipId);
        captureCurrentRevision(slipId, SlipRevisionType.CREATE, null);

        advanceOutboundToCompleted(slipId);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "OUTBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(0)));

        mockMvc.perform(post("/slips/{slipId}/revisions/{revisionNo}/restore", slipId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header("X-User-Name", "IT관리자")
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk());

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "OUTBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(1)));
    }

    /**
     * TC-7: INBOUND 전표수정내역은 다음 결재선 전송(SENT) 이후 편집만 표시한다.
     */
    @Test
    @DisplayName("TC-7: INBOUND editHistoryCount — SENT 이후 편집만 카운트")
    void tc7_inboundEditHistoryCount_stateDependent() throws Exception {
        String slipId = createInboundSlip(TODAY, "TC7거래처");
        String slipNo = getSlipNo(slipId);

        applyRevisions(slipId, 1);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "INBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(0)));

        advanceInboundToSent(slipId);
        applyRevisions(slipId, 1);

        mockMvc.perform(get(QUERY_PATH)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("slipType", "INBOUND")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].editHistoryCount", is(1)));
    }

    // -----------------------------------------------------------------------
    // 헬퍼
    // -----------------------------------------------------------------------

    /**
     * OUTBOUND 슬립 생성 헬퍼 — 슬립 UUID 반환.
     *
     * @param slipDate   전표 날짜
     * @param partnerName 거래처명
     * @param projectName 프로젝트명 (null 이면 body 에 미포함)
     * @return 생성된 슬립 UUID 문자열
     */
    private String createOutboundSlip(LocalDate slipDate, String partnerName,
                                       String projectName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 2);
        line.put("unitPrice", 50000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", slipDate.toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("deliveryTag", "SALE");
        body.put("memo", "IT 테스트 메모");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        return objectMapper.readTree(responseBody)
                .path("data").path("id").asText();
    }

    /**
     * INBOUND 슬립 생성 헬퍼 — 슬립 UUID 반환.
     */
    private String createInboundSlip(LocalDate slipDate, String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 입고 제품");
        line.put("modelName", "IN-001");
        line.put("quantity", 1);
        line.put("unitPrice", 30000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "INBOUND");
        body.put("slipDate", slipDate.toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("deliveryTag", "RETURN");
        body.put("memo", "S2c 입고 테스트 메모");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseBody = result.getResponse().getContentAsString();
        return objectMapper.readTree(responseBody)
                .path("data").path("id").asText();
    }

    /**
     * 도메인 메서드 {@code withProjectInfo} 를 통해 projectName 을 직접 설정한다.
     *
     * <p>IT 에서 도메인 메서드를 직접 호출하여 SlipRepository 를 통해 저장.
     * setter 직접 호출 금지 컨벤션 준수.
     *
     * @param slipId      대상 슬립 UUID 문자열
     * @param projectName 설정할 프로젝트명
     */
    private void applyProjectInfo(String slipId, String projectName) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        slip.withProjectInfo(null, null, null, projectName, null, null);
        slipRepository.save(slip);
    }

    /**
     * 도메인 메서드 {@code recordPrint()} 를 호출하여 인쇄 시각을 기록한다.
     *
     * @param slipId 대상 슬립 UUID 문자열
     */
    private void applyPrint(String slipId) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        slip.recordPrint();
        slipRepository.save(slip);
    }

    /**
     * 감사 revisionNo 증가를 실제 도메인 API 로 재현한다.
     *
     * @param slipId 대상 슬립 UUID 문자열
     * @param times  증가 횟수
     */
    private void applyRevisions(String slipId, int times) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        for (int i = 0; i < times; i++) {
            slip.incrementRevision();
        }
        slipRepository.saveAndFlush(slip);
    }

    /**
     * 현재 슬립 상태를 버전이력 스냅샷으로 캡처한다.
     */
    private void captureCurrentRevision(String slipId, SlipRevisionType type, Integer sourceRevisionNo) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        slipRevisionService.capture(slip, type, sourceRevisionNo,
                UUID.randomUUID(), "IT관리자", null);
    }

    /**
     * OUTBOUND 를 도메인 정규 경로로 COMPLETED 까지 전이한다.
     */
    private void advanceOutboundToCompleted(String slipId) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        if (slip.getSlipType() != SlipType.OUTBOUND) {
            throw new IllegalStateException("OUTBOUND 테스트 전표가 아닙니다: " + slipId);
        }
        slip.save();
        slip.send();
        slip.accept("warehouse-1");
        slip.process();
        slip.complete();
        slip.inspect("inspector-1");
        slipRepository.saveAndFlush(slip);
    }

    /**
     * INBOUND 를 도메인 정규 경로로 SENT 까지 전이한다.
     */
    private void advanceInboundToSent(String slipId) {
        Slip slip = slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId));
        if (slip.getSlipType() != SlipType.INBOUND) {
            throw new IllegalStateException("INBOUND 테스트 전표가 아닙니다: " + slipId);
        }
        slip.save();
        slip.send();
        slipRepository.saveAndFlush(slip);
    }

    /**
     * 슬립 UUID 로 slipNo 를 조회한다 (TC-5 printed 검색용).
     *
     * @param slipId 슬립 UUID 문자열
     * @return 전표번호 (예: "2026/05/11-001")
     */
    private String getSlipNo(String slipId) {
        return slipRepository.findById(OpaqueUuidDeserializer.decode(slipId))
                .orElseThrow(() -> new IllegalStateException("테스트 슬립 미발견: " + slipId))
                .getSlipNo();
    }
}
