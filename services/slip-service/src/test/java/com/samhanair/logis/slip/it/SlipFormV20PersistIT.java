package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * V20 신규 5 필드 입력 → persist → 판매/구매조회 매칭 검증 통합 테스트.
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>TC-1: {@code POST /slips} with V20 5 필드 → 응답에 V20 필드 echo 검증</li>
 *   <li>TC-2: 후속 {@code GET /slips/query?searchSlipNo=...} → 조회 응답의 V20 필드값 일치 검증</li>
 *   <li>TC-3: {@code PATCH /slips/{id}/v20} V20 부분 갱신 → 후속 GET 에서 신규값 반영 검증</li>
 *   <li>TC-4: businessNumber Feign resolve mock → 전표 생성 응답에 snapshot 채움 검증</li>
 *   <li>TC-5: Feign fail 시 businessNumber NULL 유지 검증</li>
 * </ul>
 *
 * <p>외부 client {@code @MockBean} 격리 6종 (memory {@code feedback_it_mockbean_external_clients}):
 * {@link ProductClient}, {@link InventoryClient}, {@link NotificationChatRoomClient},
 * {@link PartnerBlockClient}, {@link PartnerInternalClient}, {@link SmsGateway}.
 *
 * <p>{@code extends AbstractPostgresIT} — Testcontainers PostgreSQL 싱글턴 컨테이너.
 * Docker 미가용 시 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipFormV20PersistIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SALES_ROLE = "SALES";
    private static final String MASTER_ROLE = "MASTER";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

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

    /**
     * 외부 client 격리 — partner-service internal resolve 차단.
     * TC-4/TC-5 에서 businessNumber resolve 동작을 제어한다.
     */
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

    @BeforeEach
    void setUp() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(java.util.UUID.class),
                        ArgumentMatchers.anyString(),
                        ArgumentMatchers.any(com.samhanair.logis.security.permission.PermissionAction.class)))
                .thenReturn(true);
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        // ProductClient lenient stub — SlipService.create 가 라인 productId 검증 시 호출
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

        // PartnerInternalClient 기본 stub — businessNumber resolve 실패 (TC-5 기본 동작)
        Mockito.lenient()
                .when(partnerInternalClient.resolveBusinessNumber(ArgumentMatchers.any(UUID.class)))
                .thenReturn(Optional.empty());
        // partnerCode resolve 기본 stub — 실패 (TC-7 기본 동작, TC-6 에서 개별 override)
        Mockito.lenient()
                .when(partnerInternalClient.resolvePartnerCode(ArgumentMatchers.any(UUID.class)))
                .thenReturn(Optional.empty());
    }

    /**
     * TC-1: POST /slips with V20 5 필드 → 생성 응답에 V20 필드 echo 검증.
     *
     * <p>deliveryAddress / supervisionAddress / projectName / recipientPhone / paymentDueDate
     * 를 요청에 포함하여 전표 생성 후, 응답 data 에 동일 값이 반환되는지 검증한다.
     * businessNumber 는 Feign resolve 실패로 null.
     */
    @Test
    @DisplayName("TC-1: V20 5필드 포함 전표 생성 → 응답 echo 검증")
    void tc1_createWithV20Fields_echoInResponse() throws Exception {
        Map<String, Object> body = buildCreateBody(
                "서울시 강남구 테스트로 123",
                "경기도 성남시 감리현장로 456",
                "삼한에어 2026 냉난방 프로젝트",
                "010-1234-5678",
                "2026-06-30");

        mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.deliveryAddress", is("서울시 강남구 테스트로 123")))
                .andExpect(jsonPath("$.data.supervisionAddress", is("경기도 성남시 감리현장로 456")))
                .andExpect(jsonPath("$.data.projectName", is("삼한에어 2026 냉난방 프로젝트")))
                .andExpect(jsonPath("$.data.recipientPhone", is("010-1234-5678")))
                .andExpect(jsonPath("$.data.paymentDueDate", is("2026-06-30")))
                .andExpect(jsonPath("$.data.businessNumber", nullValue()));
    }

    /**
     * TC-2: 생성 후 판매/구매조회 GET → V20 필드 일치 검증.
     *
     * <p>전표 생성 후 {@code GET /slips/query?searchSlipNo=...} 으로 조회하여
     * 응답의 V20 필드값이 생성 시 입력한 값과 일치하는지 검증한다.
     */
    @Test
    @DisplayName("TC-2: 생성 후 판매/구매조회 GET → V20 필드 일치")
    void tc2_afterCreate_queryReturnsV20Fields() throws Exception {
        Map<String, Object> body = buildCreateBody(
                "배송주소 판교 테스트",
                "감리주소 분당 테스트",
                "Q2-2026 프로젝트",
                "02-1234-5678",
                "2026-07-15");

        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String slipNo = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("slipNo").asText();

        mockMvc.perform(get("/slips/query")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE)
                        .param("dateFrom", "2026-05-11")
                        .param("dateTo", "2026-05-11")
                        .param("searchSlipNo", slipNo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].deliveryAddress", is("배송주소 판교 테스트")))
                .andExpect(jsonPath("$.data.content[0].supervisionAddress", is("감리주소 분당 테스트")))
                .andExpect(jsonPath("$.data.content[0].projectName", is("Q2-2026 프로젝트")))
                .andExpect(jsonPath("$.data.content[0].recipientPhone", is("02-1234-5678")))
                .andExpect(jsonPath("$.data.content[0].paymentDueDate", is("2026-07-15")));
    }

    /**
     * TC-3: PATCH /slips/{id}/v20 부분 갱신 → 후속 GET 에서 신규값 반영 검증.
     *
     * <p>projectName / paymentDueDate 만 갱신하고 다른 필드(deliveryAddress 등) 는 null 로 두어
     * 기존 값이 보존되는지, 갱신된 필드는 신규값으로 반영되는지 검증한다.
     */
    @Test
    @DisplayName("TC-3: PATCH /v20 부분 갱신 → 후속 GET 에서 신규값 반영")
    void tc3_partialUpdateV20_reflected() throws Exception {
        // 1단계: 전표 생성
        Map<String, Object> createBody = buildCreateBody(
                "원래 배송주소",
                "원래 감리주소",
                "원래 프로젝트명",
                "010-9999-8888",
                "2026-08-01");

        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andReturn();

        String slipId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2단계: projectName / paymentDueDate 만 갱신 (deliveryAddress null → 기존 값 유지)
        Map<String, Object> patchBody = new HashMap<>();
        patchBody.put("projectName", "갱신된 프로젝트명");
        patchBody.put("paymentDueDate", "2026-09-30");
        // deliveryAddress 를 명시하지 않으면 null → 기존 값 보존

        mockMvc.perform(patch("/slips/{id}/v20", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.projectName", is("갱신된 프로젝트명")))
                .andExpect(jsonPath("$.data.paymentDueDate", is("2026-09-30")))
                // deliveryAddress 는 null 로 패치되지 않았으므로 기존 값 보존
                .andExpect(jsonPath("$.data.deliveryAddress", is("원래 배송주소")));
    }

    /**
     * TC-4: businessNumber Feign resolve mock → 전표 생성 시 snapshot 채움 검증.
     *
     * <p>PartnerInternalClient.resolveBusinessNumber 가 사업자등록번호를 반환하도록 mock 설정.
     * 전표 생성 응답의 businessNumber 가 mock 값으로 채워지는지 검증한다.
     */
    @Test
    @DisplayName("TC-4: businessNumber Feign resolve mock → 전표 생성 응답에 snapshot 채움")
    void tc4_businessNumberFeignResolve_snapshotFilled() throws Exception {
        UUID partnerId = UUID.randomUUID();
        // Feign 정상 resolve — "123-45-67890" 반환
        Mockito.when(partnerInternalClient.resolveBusinessNumber(partnerId))
                .thenReturn(Optional.of("123-45-67890"));

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", partnerId.toString());

        mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.businessNumber", is("123-45-67890")));
    }

    /**
     * TC-5: Feign fail 시 businessNumber NULL 유지 검증.
     *
     * <p>PartnerInternalClient.resolveBusinessNumber 가 empty Optional 을 반환하도록 mock 설정.
     * 전표 생성 응답의 businessNumber 가 null 인지 검증한다 (legacy 호환).
     */
    @Test
    @DisplayName("TC-5: Feign fail 시 businessNumber NULL 유지")
    void tc5_businessNumberFeignFail_nullRetained() throws Exception {
        UUID partnerId = UUID.randomUUID();
        // Feign 실패 — empty Optional 반환 (setUp 의 lenient stub 과 동일, 명시적 설정)
        Mockito.when(partnerInternalClient.resolveBusinessNumber(partnerId))
                .thenReturn(Optional.empty());

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", partnerId.toString());

        mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.businessNumber", nullValue()));
    }

    /**
     * TC-6: partnerCode Feign resolve mock → 전표 생성 시 snapshot 채움 검증 (2026-06-10).
     *
     * <p>거래명세서 공급받는자(사업자주소/대표번호)가 FE getPartnerFull(partnerCode) 로
     * 조회되므로, 생성 시점에 PartnerInternalClient.resolvePartnerCode 결과가
     * slip.partnerCode 로 snapshot 되는지 검증한다. (V15 컬럼 '후속 슬라이스' 이행)
     */
    @Test
    @DisplayName("TC-6: partnerCode Feign resolve mock → 전표 생성 응답에 snapshot 채움")
    void tc6_partnerCodeFeignResolve_snapshotFilled() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Mockito.when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.of("P-2026-0001"));

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", partnerId.toString());

        mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode", is("P-2026-0001")));
    }

    /**
     * TC-7: partnerCode resolve 실패 시 NULL 유지 (graceful fallback — legacy 호환).
     */
    @Test
    @DisplayName("TC-7: partnerCode Feign fail 시 NULL 유지")
    void tc7_partnerCodeFeignFail_nullRetained() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Mockito.when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.empty());

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", partnerId.toString());

        mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode", nullValue()));
    }

    /**
     * TC-8: updateSlip 거래처 변경 → 신규 partnerCode 재resolve 검증 (사이클1 BE 리뷰).
     */
    @Test
    @DisplayName("TC-8: PATCH /v20 거래처 변경 → 신규 partnerCode 재resolve")
    void tc8_updatePartnerChanged_partnerCodeReResolved() throws Exception {
        UUID oldPartnerId = UUID.randomUUID();
        UUID newPartnerId = UUID.randomUUID();
        Mockito.when(partnerInternalClient.resolvePartnerCode(oldPartnerId))
                .thenReturn(Optional.of("P-OLD-0001"));
        Mockito.when(partnerInternalClient.resolvePartnerCode(newPartnerId))
                .thenReturn(Optional.of("P-NEW-0002"));

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", oldPartnerId.toString());
        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode", is("P-OLD-0001")))
                .andReturn();
        String slipId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("id").asText();

        Map<String, Object> patchBody = new HashMap<>();
        patchBody.put("partnerId", newPartnerId.toString());
        mockMvc.perform(patch("/slips/{id}/v20", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode", is("P-NEW-0002")));
    }

    /**
     * TC-9: updateSlip 거래처 변경 + resolve 실패 → partnerCode NULL clear (stale 방지).
     *
     * <p>이전 거래처의 code 가 잔존하면 새 partnerId 와 불일치(stale) — 사이클1 BE 리뷰 P1.
     */
    @Test
    @DisplayName("TC-9: PATCH /v20 거래처 변경 + resolve 실패 → partnerCode NULL clear")
    void tc9_updatePartnerChanged_resolveFail_partnerCodeCleared() throws Exception {
        UUID oldPartnerId = UUID.randomUUID();
        UUID newPartnerId = UUID.randomUUID();
        Mockito.when(partnerInternalClient.resolvePartnerCode(oldPartnerId))
                .thenReturn(Optional.of("P-OLD-0001"));
        Mockito.when(partnerInternalClient.resolvePartnerCode(newPartnerId))
                .thenReturn(Optional.empty());

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", oldPartnerId.toString());
        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode", is("P-OLD-0001")))
                .andReturn();
        String slipId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("id").asText();

        Map<String, Object> patchBody = new HashMap<>();
        patchBody.put("partnerId", newPartnerId.toString());
        mockMvc.perform(patch("/slips/{id}/v20", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode", nullValue()));
    }

    /**
     * TC-10: 같은 partnerId 재전송(FE 전체필드 전송 관행) + resolve 실패 → 기존 partnerCode 유지.
     *
     * <p>사이클2 BE cross-check P1 — '변경' 판정이 req.partnerId() != null 이면 같은 거래처
     * 재전송 시 정상 code 가 NULL clear 되는 회귀. 진짜 변경(이전 partnerId 상이) 시에만 clear.
     */
    @Test
    @DisplayName("TC-10: 같은 partnerId 재전송 + resolve 실패 → partnerCode 유지")
    void tc10_samePartnerResubmit_resolveFail_partnerCodeRetained() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Mockito.when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.of("P-KEEP-0001"));

        Map<String, Object> body = buildCreateBody(null, null, null, null, null);
        body.put("partnerId", partnerId.toString());
        MvcResult createResult = mockMvc.perform(post("/slips")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode", is("P-KEEP-0001")))
                .andReturn();
        String slipId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 이후 resolve 실패로 전환 — 같은 partnerId 재전송 시 기존 code 유지되어야 함
        Mockito.when(partnerInternalClient.resolvePartnerCode(partnerId))
                .thenReturn(Optional.empty());

        Map<String, Object> patchBody = new HashMap<>();
        patchBody.put("partnerId", partnerId.toString()); // 동일 거래처 (FE 전체필드 전송)
        patchBody.put("projectName", "재전송 갱신");
        mockMvc.perform(patch("/slips/{id}/v20", slipId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, SALES_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode", is("P-KEEP-0001")));
    }

    // ========================================================================
    // 헬퍼 메서드
    // ========================================================================

    /**
     * 출고전표 생성 요청 body 빌드 — V20 5 필드 포함.
     *
     * @param deliveryAddress 배송주소 (null 가능)
     * @param supervisionAddress 감리주소 (null 가능)
     * @param projectName 프로젝트명 (null 가능)
     * @param recipientPhone 인수자 번호 (null 가능)
     * @param paymentDueDate 입금예정일 ISO 문자열 (null 가능)
     * @return MockMvc 에 전달할 요청 body Map
     */
    private Map<String, Object> buildCreateBody(
            String deliveryAddress,
            String supervisionAddress,
            String projectName,
            String recipientPhone,
            String paymentDueDate) {

        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 3);
        line.put("unitPrice", 150000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-11");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("lines", List.of(line));

        // V20 신규 5 필드 (null 이면 요청에서 생략)
        if (deliveryAddress != null) body.put("deliveryAddress", deliveryAddress);
        if (supervisionAddress != null) body.put("supervisionAddress", supervisionAddress);
        if (projectName != null) body.put("projectName", projectName);
        if (recipientPhone != null) body.put("recipientPhone", recipientPhone);
        if (paymentDueDate != null) body.put("paymentDueDate", paymentDueDate);

        return body;
    }
}
