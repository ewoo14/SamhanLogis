package com.samhanair.logis.partner.it;

import static org.mockito.ArgumentMatchers.anyString;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.dto.PartnerAdminRequest;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Admin CRUD endpoint 권한 / 흐름 시나리오.
 *
 * <p>커버:
 * <ol>
 *   <li>인증 미적재 → 403 (Spring Security 기본 — protected endpoint)</li>
 *   <li>X-User-Role = SALES 의 legacy admin POST → 403 FORBIDDEN</li>
 *   <li>X-User-Role = SALES 의 목록/검색/상세 조회 → 200 + 내부 UUID 비노출</li>
 *   <li>X-User-Role = MANAGER → 200, 신규 거래처 등록 OK</li>
 *   <li>중복 partnerCode → 409 CONFLICT</li>
 *   <li>X-User-Role = MASTER + DELETE → 200 (soft-delete)</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
class PartnerAdminControllerIT extends AbstractPostgresIT {

    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000101";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000102";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000103";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanup() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
        // soft-delete 행까지 물리 삭제. @SQLRestriction 로 인해 HQL deleteAll 은 삭제행을 남겨
        // searchAdminIncludingDeleted 노출·테스트 순서의존 flaky 를 유발하므로 native 로 전량 제거.
        // FK 자식 테이블에는 ON DELETE CASCADE 가 없으므로 자식→부모 순서로 정리한다.
        jdbcTemplate.update("DELETE FROM partner_credit_history");
        jdbcTemplate.update("DELETE FROM partner_attachments");
        jdbcTemplate.update("DELETE FROM partners");
    }

    @Test
    void create_without_authentication_returns_403() throws Exception {
        // Spring Security 기본 — 인증 미적재 + protected endpoint 시 AccessDeniedException → 403
        PartnerAdminRequest req = sampleRequest("P-2026-0010", "999-88-77777");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void create_with_sales_role_returns_403() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0011", "999-88-77778");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void create_with_manager_role_returns_200_and_persists_active_partner() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0012", "999-88-77779");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-2026-0012"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.id").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("ACTIVE"));
    }

    @Test
    void find_all_with_sales_role_returns_partner_code_list_without_uuid() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0015", "999-88-77782");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "partnerCode,asc"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.content[0].partnerCode").value("P-2026-0015"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.content[0].id").doesNotExist());
    }

    @Test
    void quick_search_with_sales_role_returns_customer_rows() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-QUICK-001", "999-88-77783");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/partners/quick-search")
                        .param("q", "P-2026-QUICK")
                        .param("size", "20")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].id").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].partnerCode")
                        .value("P-2026-QUICK-001"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].partnerName")
                        .value("(주)샘플"));
    }

    @Test
    void search_with_sales_role_returns_partner_code_items_without_uuid() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0016", "999-88-77783");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "P-2026-0016")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-2026-0016"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].id").doesNotExist());
    }

    @Test
    void find_one_with_sales_role_returns_partner_code_detail_without_uuid() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0017", "999-88-77784");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/P-2026-0017")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-2026-0017"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.id").doesNotExist());
    }

    @Test
    void create_duplicate_partner_code_returns_409() throws Exception {
        PartnerAdminRequest first = sampleRequest("P-2026-0013", "999-88-77780");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(first)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        PartnerAdminRequest dup = new PartnerAdminRequest("P-2026-0013", "999-88-99999",
                "(주)다른상호", null, null, BigDecimal.ZERO);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dup)))
                .andExpect(MockMvcResultMatchers.status().isConflict())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void delete_with_master_role_returns_200_and_soft_deletes() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0014", "999-88-77781");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-2026-0014")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());

        // soft-delete 후 SQLRestriction 으로 미조회 → 후속 GET 은 404
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/P-2026-0014")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void delete_search_includes_deleted_metadata_and_restore_reactivates_partner() throws Exception {
        PartnerAdminRequest req = sampleRequest("P-2026-0018", "999-88-77785");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-2026-0018")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Name", "이운영")
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "P-2026-0018")
                        .param("includeDeleted", "true"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-2026-0018"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].isDeleted").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].deletedByName").value("이운영"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].deletedAt").exists());

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners/P-2026-0018/restore")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-2026-0018"));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "P-2026-0018"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].isDeleted").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].deletedByName").doesNotExist());
    }

    @Test
    void search_default_excludes_deleted_partner_from_shared_autocomplete_contract() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-DEL-HIDE", "111-22-33331"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-DEL-HIDE")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "P-DEL-HIDE")
                        .param("size", "20"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items.length()").value(0));
    }

    @Test
    void search_treats_percent_and_underscore_as_literal_characters() throws Exception {
        String literalCode = "P-LUNA-%_";
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest(literalCode, "111-22-33341"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-LUNA-PLAIN", "111-22-33342"))))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "%"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.total").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value(literalCode));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "_"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.total").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value(literalCode));
    }

    @Test
    void search_includeDeleted_true_exposes_deleted_partner_for_admin_list_only() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-DEL-SHOW", "111-22-33332"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-DEL-SHOW")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Name", "이운영")
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("q", "P-DEL-SHOW")
                        .param("includeDeleted", "true")
                        .param("size", "20"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-DEL-SHOW"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].isDeleted").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].deletedByName").value("이운영"));
    }

    @Test
    void find_all_default_excludes_deleted_partner() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-DEL-LIST", "111-22-33333"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-DEL-LIST")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("page", "0")
                        .param("size", "20")
                        .param("sort", "partnerCode,asc"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void search_status_filter_returns_only_matching_status() throws Exception {
        // status 필터가 기본(JPQL 활성전용) 경로와 native(includeDeleted=true, searchAdminIncludingDeleted) 경로
        // 양쪽에서 정상 동작함을 실 Postgres 로 고정한다. 특히 native 경로는 @Enumerated(STRING) enum 을 raw 바인딩하면
        // Hibernate 가 ordinal(정수)로 바인딩해 status 필터가 영구 0건이 되던 회귀 — status.name() String CAST 로 가드.
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-STAT-ACT", "111-11-11111"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-STAT-SUS", "222-22-22222"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        Partner suspended = partnerRepository.findByPartnerCode("P-STAT-SUS").orElseThrow();
        suspended.suspend();
        partnerRepository.saveAndFlush(suspended);

        // status=ACTIVE → ACTIVE 만(P-STAT-ACT). enum ordinal 버그였다면 0건.
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("status", "ACTIVE")
                        .param("size", "50"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-STAT-ACT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].status").value("ACTIVE"));

        // legacy type=SUSPENDED 도 기존 호출 호환으로 유지한다.
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("type", "SUSPENDED")
                        .param("size", "50"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-STAT-SUS"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].status").value("SUSPENDED"));

        // native 경로(includeDeleted=true = searchAdminIncludingDeleted)의 enum String CAST 회귀가드.
        // 이 조합을 검증하지 않으면 status.name() 변환이 제거돼 ordinal 바인딩 버그가 CI 에서 조용히 재유입될 수 있다.
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/partners/search")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("status", "ACTIVE")
                        .param("includeDeleted", "true")
                        .param("size", "50"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].partnerCode").value("P-STAT-ACT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.items[0].status").value("ACTIVE"));
    }

    @Test
    void restore_whenActivePartnerReusesCode_returns409() throws Exception {
        // 삭제행 + 동일 code 활성행 공존(partial unique 가 code 재사용 허용) 시 복원=409(활성 unique 위반 방지).
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID).header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-DUAL-01", "111-11-22221"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/partners/P-DUAL-01")
                        .header("X-User-Id", MASTER_ACCOUNT_ID).header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isOk());
        // 삭제된 P-DUAL-01 위에 동일 code 활성 거래처 신규 생성(partial unique 허용)
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners")
                        .header("X-User-Id", MASTER_ACCOUNT_ID).header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(sampleRequest("P-DUAL-01", "111-11-22222"))))
                .andExpect(MockMvcResultMatchers.status().isOk());
        // 삭제행 복원 시도 → 활성행 존재로 409(500 아님)
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/partners/P-DUAL-01/restore")
                        .header("X-User-Id", MASTER_ACCOUNT_ID).header("X-User-Role", "MASTER"))
                .andExpect(MockMvcResultMatchers.status().isConflict());
    }

    private PartnerAdminRequest sampleRequest(String partnerCode, String bizNo) {
        return new PartnerAdminRequest(
                partnerCode,
                bizNo,
                "(주)샘플",
                "서울 종로구 종로 1",
                "02-9999-0000",
                new BigDecimal("3000000"));
    }
}
