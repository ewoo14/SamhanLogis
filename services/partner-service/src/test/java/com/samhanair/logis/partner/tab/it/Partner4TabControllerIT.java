package com.samhanair.logis.partner.tab.it;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.dto.PartnerAdminRequest;
import com.samhanair.logis.partner.it.AbstractPostgresIT;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * 거래처 4탭 Controller 통합 테스트.
 *
 * <p>커버 시나리오:
 * <ol>
 *   <li>POST /full — 4탭 일괄 등록 (배송지/담당자 포함) → 201</li>
 *   <li>GET /{partnerCode}/full — 4탭 일괄 조회 → 200, 응답 필드 검증</li>
 *   <li>PUT /{partnerCode}/price-discount — 단가/할인 정책 UPSERT → 200</li>
 *   <li>POST /{partnerCode}/shipping-addresses — 배송지 추가 → 201</li>
 *   <li>DELETE /{partnerCode}/shipping-addresses/{addrId} — 배송지 soft-delete → 204</li>
 * </ol>
 *
 * <p>IT 외부 RestClient @MockBean 가드 — partner-service 는 외부 service 호출 없음 (자체 DB 만 사용).
 * Docker 미가용 환경은 {@link AbstractPostgresIT.DockerAvailableCondition} 이 자동 skip.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Partner4TabControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private PartnerPriceDiscountRepository priceDiscountRepository;

    @Autowired
    private PartnerShippingAddressRepository shippingAddressRepository;

    @Autowired
    private PartnerContactRepository contactRepository;

    @BeforeEach
    void cleanup() {
        contactRepository.deleteAll();
        shippingAddressRepository.deleteAll();
        priceDiscountRepository.deleteAll();
        partnerRepository.deleteAll();
    }

    // ----------------------------------------------------------------
    // 1. POST /full — 4탭 일괄 등록 → 201
    // ----------------------------------------------------------------

    @Test
    void registerFull_returns_201_with_all_tabs() throws Exception {
        PartnerFullRequest req = new PartnerFullRequest(
                "P-4TAB-001", "111-11-11111", "(주)4탭테스트",
                new PartnerPriceDiscountRequest(new BigDecimal("5.00"), 30, "VIP"),
                List.of(new PartnerShippingAddressRequest(
                        "본사창고", "12345", "서울 강남구 테헤란로 1",
                        "02-1111-0000", "홍길동", true, null)),
                List.of(new PartnerContactRequest(
                        "김영업", "팀장", "010-0000-1111", null, true, null))
        );

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/partners/full")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.partnerCode").value("P-4TAB-001"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.basicDiscountRate").value(5.0))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses[0].alias").value("본사창고"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts[0].contactName").value("김영업"));
    }

    // ----------------------------------------------------------------
    // 2. GET /{partnerCode}/full — 4탭 일괄 조회 → 200
    // ----------------------------------------------------------------

    @Test
    void getFull_returns_200_with_correct_data() throws Exception {
        // 선행 등록
        PartnerFullRequest req = new PartnerFullRequest(
                "P-4TAB-002", "222-22-22222", "(주)조회테스트",
                new PartnerPriceDiscountRequest(new BigDecimal("3.50"), 45, null),
                List.of(),
                List.of()
        );
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/partners/full")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/partners/P-4TAB-002/full")
                        .header("X-User-Id", "user-sales")
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.partnerCode").value("P-4TAB-002"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basic.name").value("(주)조회테스트"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.priceDiscount.paymentTermDays").value(45))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.shippingAddresses").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.contacts").isArray());
    }

    // ----------------------------------------------------------------
    // 3. PUT /{partnerCode}/price-discount — 단가/할인 정책 UPSERT → 200
    // ----------------------------------------------------------------

    @Test
    void upsertPriceDiscount_returns_200_and_updates_rate() throws Exception {
        // 선행 거래처 등록 (기존 admin endpoint 사용)
        PartnerAdminRequest adminReq = new PartnerAdminRequest(
                "P-4TAB-003", "333-33-33333", "(주)단가테스트",
                "서울 종로구", "02-3333-0000", BigDecimal.ZERO);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adminReq)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        PartnerPriceDiscountRequest discountReq = new PartnerPriceDiscountRequest(
                new BigDecimal("7.00"), 60, "대량 할인");

        mockMvc.perform(MockMvcRequestBuilders.put("/api/v1/partners/P-4TAB-003/price-discount")
                        .header("X-User-Id", "user-manager")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(discountReq)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.basicDiscountRate").value(7.0))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.paymentTermDays").value(60))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.discountMemo").value("대량 할인"));
    }

    // ----------------------------------------------------------------
    // 4. POST /{partnerCode}/shipping-addresses — 배송지 추가 → 201
    // ----------------------------------------------------------------

    @Test
    void addShippingAddress_returns_201_and_persists() throws Exception {
        PartnerAdminRequest adminReq = new PartnerAdminRequest(
                "P-4TAB-004", "444-44-44444", "(주)배송테스트",
                "서울 마포구", "02-4444-0000", BigDecimal.ZERO);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adminReq)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        PartnerShippingAddressRequest addrReq = new PartnerShippingAddressRequest(
                "강남물류", "06234", "서울 강남구 봉은사로 1",
                "02-5555-0000", "이수신", true, "메인 배송지");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/partners/P-4TAB-004/shipping-addresses")
                        .header("X-User-Id", "user-manager")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(addrReq)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.alias").value("강남물류"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.isDefault").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.id").isNotEmpty());
    }

    // ----------------------------------------------------------------
    // 5. DELETE /{partnerCode}/shipping-addresses/{addrId} — soft-delete → 204
    // ----------------------------------------------------------------

    @Test
    void deleteShippingAddress_returns_204_and_removes_from_list() throws Exception {
        PartnerAdminRequest adminReq = new PartnerAdminRequest(
                "P-4TAB-005", "555-55-55555", "(주)삭제테스트",
                "서울 영등포구", "02-5555-1111", BigDecimal.ZERO);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adminReq)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        PartnerShippingAddressRequest addrReq = new PartnerShippingAddressRequest(
                "임시창고", "07777", "서울 영등포구 여의도동 1",
                null, null, false, null);

        // 배송지 추가 후 id 추출
        String addResult = mockMvc.perform(
                        MockMvcRequestBuilders.post("/api/v1/partners/P-4TAB-005/shipping-addresses")
                                .header("X-User-Id", "user-master")
                                .header("X-User-Role", "MASTER")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(addrReq)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String addrId = objectMapper.readTree(addResult).at("/data/id").asText();

        // 배송지 삭제
        mockMvc.perform(MockMvcRequestBuilders.delete(
                                "/api/v1/partners/P-4TAB-005/shipping-addresses/" + addrId)
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isNoContent());

        // 삭제 후 목록 조회 → 빈 배열
        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/partners/P-4TAB-005/shipping-addresses")
                        .header("X-User-Id", "user-master")
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(0));
    }
}
