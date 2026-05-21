package com.samhanair.logis.partner.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Internal endpoint 인증 / lookup 시나리오.
 *
 * <p>커버:
 * <ol>
 *   <li>X-Internal-Token 누락 → 403 (Spring Security 기본 — 인증 미적재 + protected endpoint)</li>
 *   <li>X-Internal-Token 불일치 → 401 (InternalTokenFilter 가 직접 401 응답)</li>
 *   <li>X-Internal-Token 일치 + 존재하는 partnerCode → 200, partnerId / 마스터 / 신용 정보</li>
 *   <li>X-Internal-Token 일치 + 미존재 partnerCode → 404</li>
 * </ol>
 *
 * <p>토큰 누락 = 익명 요청 → AuthorizationFilter 가 AccessDeniedException → 403.
 * 토큰 불일치 = InternalTokenFilter 가 직접 401 status + ApiResponse 본문 전송 (filter chain 단절).
 *
 * <p>외부 client 의존성 없음 (self-contained service) — {@code @MockBean} 격리 불요.
 * (memory feedback_it_mockbean_external_clients 가드 = 외부 client 가 있을 때만 적용)
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
class PartnerInternalControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerRepository partnerRepository;

    @BeforeEach
    void seedFixturePartner() {
        partnerRepository.deleteAll();
        Partner p = Partner.register("P-2026-0001", "111-22-33333", "(주)테스트거래처",
                "서울 강남구 테스트로 1", "02-1234-5678", new BigDecimal("5000000"));
        partnerRepository.save(p);
    }

    @Test
    void lookup_without_internal_token_returns_403() throws Exception {
        // 토큰 누락 = 익명 요청 → AuthorizationFilter 의 AccessDeniedException → 403
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/P-2026-0001"))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void lookup_with_invalid_internal_token_returns_401() throws Exception {
        // 토큰 불일치 = InternalTokenFilter 가 직접 401 응답 (filter chain 단절)
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/P-2026-0001")
                        .header("X-Internal-Token", "wrong-token"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void lookup_with_valid_token_returns_partner_master_with_uuid() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/P-2026-0001")
                        .header("X-Internal-Token", "test-internal-token")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-2026-0001"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.name").value("(주)테스트거래처"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerId").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.creditLimit").value(5000000))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status")
                        .value(PartnerStatus.ACTIVE.name()));

        // 부수 효과 검증 — 본 lookup 은 read-only, balance / status 변경 X
        Partner reloaded = partnerRepository.findByPartnerCode("P-2026-0001").orElseThrow();
        assertThat(reloaded.getOutstandingBalance()).isEqualByComparingTo("0");
    }

    @Test
    void lookup_with_valid_token_but_missing_code_returns_404() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/P-NOT-EXIST")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(MockMvcResultMatchers.status().isNotFound())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("NOT_FOUND"));
    }

    /**
     * Phase 9 W5 신규 (D-P9-16, BE 의견 3 채택) — bulk endpoint 정상 응답.
     *
     * <p>fixture 1건 + 추가 1건 등록 후 두 코드 동시 조회 시 2건 매칭 검증.
     */
    @Test
    void find_by_codes_with_valid_token_returns_matched_partners() throws Exception {
        Partner extra = Partner.register("P-2026-0002", "222-33-44444", "추가 거래처",
                null, null, new BigDecimal("3000000"));
        partnerRepository.save(extra);

        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/find-by-codes")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"P-2026-0001\",\"P-2026-0002\"]"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(2));
    }

    /**
     * 빈 배열 입력 시 200 + 빈 리스트 (DB 조회 회피, service 계층에서 short-circuit).
     */
    @Test
    void find_by_codes_with_empty_list_returns_200_empty() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/find-by-codes")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(0));
    }

    /**
     * 일부 미존재 코드 + 일부 존재 코드 혼합 — 존재 코드만 응답에 포함, 미존재 코드는 누락.
     */
    @Test
    void find_by_codes_with_partial_missing_returns_only_existing() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/find-by-codes")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"P-2026-0001\",\"P-NOT-EXIST\"]"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].partnerCode").value("P-2026-0001"));
    }

    /**
     * bulk endpoint 도 토큰 누락 → 403 (Spring Security AccessDeniedException 일관).
     */
    @Test
    void find_by_codes_without_internal_token_returns_403() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/find-by-codes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"P-2026-0001\"]"))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    /**
     * SP-08-FU2 P2-3 — partnerId 로 거래처 summary 조회 ({@code GET /internal/partners/{id}/summary}).
     *
     * <p>정상 케이스: valid token + 존재하는 partnerId → 200 + partnerCode / name 포함.
     */
    @Test
    void get_summary_by_partner_id_returns_200() throws Exception {
        Partner saved = partnerRepository.findByPartnerCode("P-2026-0001").orElseThrow();
        java.util.UUID partnerId = saved.getId();

        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/{id}/summary", partnerId)
                        .header("X-Internal-Token", "test-internal-token")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-2026-0001"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.name").value("(주)테스트거래처"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerId").exists());
    }

    /**
     * SP-08-FU2 P2-3 — 미존재 UUID 로 summary 조회 → 404.
     */
    @Test
    void get_summary_by_missing_partner_id_returns_404() throws Exception {
        java.util.UUID nonExistentId = java.util.UUID.randomUUID();

        mockMvc.perform(MockMvcRequestBuilders.get("/internal/partners/{id}/summary", nonExistentId)
                        .header("X-Internal-Token", "test-internal-token")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(MockMvcResultMatchers.status().isNotFound())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false));
    }

    @Test
    void lookup_by_ids_with_valid_token_returns_partner_names() throws Exception {
        Partner saved = partnerRepository.findByPartnerCode("P-2026-0001").orElseThrow();
        Partner extra = Partner.register("P-2026-0002", "222-33-44444", "추가 거래처",
                null, null, new BigDecimal("3000000"));
        partnerRepository.save(extra);

        String body = """
                {"ids":["%s","%s"]}
                """.formatted(saved.getId(), extra.getId());

        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/lookup-by-ids")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners[0].id").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners[*].name")
                        .value(org.hamcrest.Matchers.containsInAnyOrder("(주)테스트거래처", "추가 거래처")));
    }

    @Test
    void lookup_by_ids_with_empty_ids_returns_200_empty() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/lookup-by-ids")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[]}"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners.length()").value(0));
    }

    @Test
    void lookup_by_ids_without_internal_token_returns_403() throws Exception {
        Partner saved = partnerRepository.findByPartnerCode("P-2026-0001").orElseThrow();

        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/lookup-by-ids")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + saved.getId() + "\"]}"))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void lookup_by_ids_with_partial_missing_returns_only_existing() throws Exception {
        Partner saved = partnerRepository.findByPartnerCode("P-2026-0001").orElseThrow();
        java.util.UUID missingId = java.util.UUID.randomUUID();

        String body = """
                {"ids":["%s","%s"]}
                """.formatted(saved.getId(), missingId);

        mockMvc.perform(MockMvcRequestBuilders.post("/internal/partners/lookup-by-ids")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners[0].id")
                        .value(saved.getId().toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partners[0].name")
                        .value("(주)테스트거래처"));
    }
}
