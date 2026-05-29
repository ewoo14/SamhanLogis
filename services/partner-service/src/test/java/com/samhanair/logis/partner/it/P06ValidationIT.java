package com.samhanair.logis.partner.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.Rollback;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-6 거래처 4탭 일괄 등록/수정/조회 통합 테스트.
 *
 * <p>커버 시나리오:
 * <ol>
 *   <li>{@code POST /api/v1/partners/full} — 4탭 일괄 등록 (partnerCode/bizNo/name + priceDiscount
 *       + shippingAddresses × 2 + contacts × 2)</li>
 *   <li>{@code POST /api/v1/partners/full} 중복 등록 → 409 CONFLICT</li>
 *   <li>{@code GET /api/v1/partners/{partnerCode}/full} — 4탭 전체 응답 검증
 *       (basic.partnerCode / priceDiscount.basicDiscountRate / shippingAddresses size /
 *       contacts size)</li>
 *   <li>{@code PATCH /api/v1/partners/{partnerCode}/full} — 4탭 일괄 수정
 *       (name 변경 + priceDiscount 갱신 + shippingAddresses 교체 + contacts 교체)</li>
 *   <li>수정 후 {@code GET /api/v1/partners/{partnerCode}/full} 으로 변경 검증</li>
 *   <li>SALES 역할 POST → 201 CREATED + 내부 UUID 비노출</li>
 * </ol>
 *
 * <p>PR #140 회고 — Testcontainers connection: {@link AbstractPostgresIT} 상속으로
 * 싱글턴 PostgreSQLContainer 공유. Docker 미가용 환경에서는 {@code DockerAvailableCondition}
 * 이 자동 skip 처리.
 *
 * <p>외부 client mock 없음 — partner-service 는 self-contained (외부 RestClient 의존 없음).
 * Eureka 는 {@code AbstractPostgresIT#registerDatasource} 에서 {@code eureka.client.enabled=false}
 * 로 비활성화.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@Rollback
class P06ValidationIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/api/v1/partners";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    /** 각 테스트에서 고유한 partnerCode 사용 (DB 충돌 회피). */
    private static final String PC_IT = "IT-P06-001";
    private static final String BIZ_IT = "888-88-11001";
    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000111";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000112";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000113";

    @BeforeEach
    void cleanupItData() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);

        // @Transactional + @Rollback 으로 각 테스트 후 자동 롤백 — beforeEach 별도 삭제 불필요.
        // 싱글턴 컨테이너 공유이므로 다른 IT 에서 삽입한 seed 데이터와 충돌하지 않도록
        // 테스트 전용 partnerCode 분리 (IT-P06-xxx).
    }

    // ================================================================
    // 시나리오 1: 4탭 일괄 등록 정상 흐름
    // ================================================================

    @Test
    @DisplayName("POST /api/v1/partners/full — 4탭 일괄 등록 201 + 응답 검증")
    void registerFull_with_all_4_tabs_returns_201() throws Exception {
        PartnerFullRequest req = buildFullRequest(PC_IT, BIZ_IT, "(주)IT검증거래처");

        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                // 기본정보 탭
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.partnerCode").value(PC_IT))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.id").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.bizNo").value(BIZ_IT))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.name").value("(주)IT검증거래처"))
                // 단가/할인 탭
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.basicDiscountRate")
                        .value(3.00))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.paymentTermDays")
                        .value(30))
                // 배송지 탭 — 2건
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses[0].alias")
                        .value("IT 본사"))
                // 담당자 탭 — 2건
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts[0].contactName")
                        .value("홍영업"));
    }

    // ================================================================
    // 시나리오 2: 중복 partnerCode → 409
    // ================================================================

    @Test
    @DisplayName("POST /api/v1/partners/full — 중복 partnerCode 409 CONFLICT")
    void registerFull_duplicate_partnerCode_returns_409() throws Exception {
        PartnerFullRequest first = buildFullRequest(PC_IT, BIZ_IT, "(주)첫번째");
        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(first)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        PartnerFullRequest dup = buildFullRequest(PC_IT, "999-88-99001", "(주)중복코드");
        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dup)))
                .andExpect(MockMvcResultMatchers.status().isConflict())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("CONFLICT"));
    }

    // ================================================================
    // 시나리오 3: GET /full — 4탭 응답 검증
    // ================================================================

    @Test
    @DisplayName("GET /api/v1/partners/{partnerCode}/full — 4탭 전체 응답 구조 검증")
    void getFull_returns_all_4_tabs() throws Exception {
        // 선 등록
        PartnerFullRequest req = buildFullRequest(PC_IT, BIZ_IT, "(주)IT검증거래처");
        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        // 4탭 조회
        mockMvc.perform(MockMvcRequestBuilders.get(BASE_URL + "/" + PC_IT + "/full")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                // 기본정보
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.partnerCode").value(PC_IT))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.status").value("ACTIVE"))
                // 단가/할인 (탭2)
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.basicDiscountRate")
                        .value(3.00))
                // 배송지 (탭3) — 2건, 첫 번째가 기본 배송지
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath(
                        "$.data.shippingAddresses[?(@.isDefault == true)].alias").exists())
                // 담당자 (탭4) — 2건, isPrimary 1건
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath(
                        "$.data.contacts[?(@.isPrimary == true)].contactName").exists());
    }

    // ================================================================
    // 시나리오 4: PATCH /full — 4탭 일괄 수정 후 검증
    // ================================================================

    @Test
    @DisplayName("PATCH /api/v1/partners/{partnerCode}/full — 4탭 수정 후 변경 검증")
    void updateFull_modifies_all_tabs_and_reflects_on_get() throws Exception {
        // 선 등록
        PartnerFullRequest createReq = buildFullRequest(PC_IT, BIZ_IT, "(주)IT검증거래처");
        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        // 4탭 수정 요청 구성 (name 변경 + 할인율 변경 + 배송지/담당자 교체)
        PartnerFullRequest patchReq = new PartnerFullRequest(
                null, null,
                "(주)IT수정거래처",
                new PartnerPriceDiscountRequest(new BigDecimal("7.50"), 60, "수정 후 7.5% 할인"),
                List.of(
                        new PartnerShippingAddressRequest(
                                "수정 창고", "12345", "경기 수원시 영통구 수정로 1",
                                "031-1111-0001", "수정담당자", true, null)
                ),
                List.of(
                        new PartnerContactRequest(
                                "수정영업", "부장", "031-2222-0001", "update@test.co.kr",
                                true, "수정 후 주 담당자")
                )
        );

        mockMvc.perform(MockMvcRequestBuilders.patch(BASE_URL + "/" + PC_IT + "/full")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchReq)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.name").value("(주)IT수정거래처"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.basicDiscountRate")
                        .value(7.50))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses[0].alias")
                        .value("수정 창고"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts[0].contactName")
                        .value("수정영업"));

        // GET 으로 재확인
        mockMvc.perform(MockMvcRequestBuilders.get(BASE_URL + "/" + PC_IT + "/full")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.name").value("(주)IT수정거래처"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.paymentTermDays")
                        .value(60))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts.length()").value(1));
    }

    // ================================================================
    // 시나리오 5: SALES 역할 POST → 201
    // ================================================================

    @Test
    @DisplayName("POST /api/v1/partners/full — SALES 역할 201 + partnerCode 응답")
    void registerFull_with_sales_role_returns_201_and_partner_code() throws Exception {
        PartnerFullRequest req = buildFullRequest("IT-P06-SALES", "777-88-11001", "(주)IT세일즈");
        mockMvc.perform(MockMvcRequestBuilders.post(BASE_URL + "/full")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.partnerCode").value("IT-P06-SALES"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.id").doesNotExist());
    }

    // ================================================================
    // 시나리오 6: 미존재 partnerCode → 404
    // ================================================================

    @Test
    @DisplayName("GET /api/v1/partners/{partnerCode}/full — 미존재 코드 404")
    void getFull_nonexistent_returns_404() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get(BASE_URL + "/NOT-EXIST/full")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    // ================================================================
    // Helper
    // ================================================================

    /**
     * 4탭 전체 요청 빌더 헬퍼.
     * priceDiscount 3% + shippingAddresses 2건 + contacts 2건 포함.
     */
    private PartnerFullRequest buildFullRequest(String partnerCode, String bizNo, String name) {
        PartnerPriceDiscountRequest price = new PartnerPriceDiscountRequest(
                new BigDecimal("3.00"), 30, "IT 테스트 할인");

        List<PartnerShippingAddressRequest> addresses = List.of(
                new PartnerShippingAddressRequest(
                        "IT 본사", "06134", "서울 강남구 테헤란로 IT 1",
                        "02-IT01-0001", "IT수신자1", true, null),
                new PartnerShippingAddressRequest(
                        "IT 물류센터", "13210", "경기 성남 판교 IT 2",
                        "02-IT01-0002", "IT수신자2", false, null)
        );

        List<PartnerContactRequest> contacts = List.of(
                new PartnerContactRequest(
                        "홍영업", "팀장", "02-IT02-0001", "hong.it@test.co.kr",
                        true, "주 담당자"),
                new PartnerContactRequest(
                        "임회계", "대리", "02-IT02-0002", "lim.it@test.co.kr",
                        false, "세금계산서 담당")
        );

        return new PartnerFullRequest(partnerCode, bizNo, name, price, addresses, contacts);
    }
}
