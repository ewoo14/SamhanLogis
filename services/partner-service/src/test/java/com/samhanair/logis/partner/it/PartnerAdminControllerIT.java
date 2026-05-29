package com.samhanair.logis.partner.it;

import static org.mockito.ArgumentMatchers.anyString;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.partner.dto.PartnerAdminRequest;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
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
        partnerRepository.deleteAll();
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
