package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** #810 매핑 CRUD와 RequirePermission 실 HTTP(MockMvc) enforcement 통합 테스트. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BankDepositorPartnerMappingControllerIT extends AbstractPostgresIT {

    private static final String URL = "/accounting/deposit-mappings";
    private static final String PAGE = "accounting.deposit-mapping";
    private static final UUID ACTOR = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PARTNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID PARTNER_2_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final PartnerSummary PARTNER = new PartnerSummary(PARTNER_ID, "P-001", "삼한상사", null, null);
    private static final PartnerSummary PARTNER_2 = new PartnerSummary(PARTNER_2_ID, "P-002", "두번째상사", null, null);

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpMappingData() {
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
        jdbcTemplate.update("DELETE FROM accounting_audit_logs WHERE field_name LIKE 'mapping.%'");
        lenient().when(partnerLookupClient.findByPartnerCode("P-001")).thenReturn(Optional.of(PARTNER));
        lenient().when(partnerLookupClient.findByPartnerCode("P-002")).thenReturn(Optional.of(PARTNER_2));
        lenient().when(partnerLookupClient.findByPartnerId(PARTNER_ID)).thenReturn(Optional.of(PARTNER));
        lenient().when(partnerLookupClient.findByPartnerId(PARTNER_2_ID)).thenReturn(Optional.of(PARTNER_2));
    }

    @Test
    @DisplayName("CRUD는 business key와 partnerCode만 노출하고 soft delete 후 같은 key 재생성을 허용한다")
    void crudUsesBusinessKeyAndSoftDelete() throws Exception {
        create("  Acme  ", "P-001")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.rawName").value("Acme"))
                .andExpect(jsonPath("$.data.normalizedName").value("ACME"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-001"))
                .andExpect(jsonPath("$.data.id").doesNotExist());

        mockMvc.perform(get(URL).header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));

        mockMvc.perform(put(URL)
                        .param("normalizedName", "ACME")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rawName\":\"AcmeUpdated\",\"partnerCode\":\"P-002\",\"reason\":\"ADMIN_UPDATE\"}")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.normalizedName").value("ACMEUPDATED"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-002"));

        // #810 적대검증 R1 (L4-H2): 이력은 entityId 기준 전 필드 행 — 생성 4행 + 수정 4행,
        // rename 후에도 이전 키(ACME) 시절 생성 이력이 절단되지 않는다.
        String historyJson = mockMvc.perform(get(URL + "/history")
                        .param("normalizedName", "ACMEUPDATED")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(8))
                .andExpect(jsonPath(
                        "$.data[?(@.fieldName=='mapping.partnerCode' && @.oldValue=='P-001' && @.newValue=='P-002')]")
                        .exists())
                .andExpect(jsonPath("$.data[?(@.fieldName=='mapping.reason' && @.newValue=='ADMIN_UPDATE')]")
                        .exists())
                .andExpect(jsonPath("$.data[?(@.fieldName=='mapping.normalizedName' && @.newValue=='ACME')]")
                        .exists())
                .andExpect(jsonPath("$.data[?(@.fieldName=='mapping.rawName' && @.newValue=='AcmeUpdated')]")
                        .exists())
                .andExpect(jsonPath("$.data[0].revisionNo").value(2))
                .andExpect(jsonPath("$.data[0].operationOrdinal").value(2))
                .andExpect(jsonPath("$.data[0].generation").value(1))
                .andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        // #810 R3-CODEX (S4-M3, 계약 pin): 같은 revisionNo 를 공유하는 행들 사이에서도
        // entryKey 는 행마다 유일·안정한 opaque 문자열(32자 hex — UUID 형식 아님)이어야 한다.
        java.util.List<String> entryKeys =
                com.jayway.jsonpath.JsonPath.read(historyJson, "$.data[*].entryKey");
        assertThat(entryKeys)
                .hasSize(8)
                .doesNotHaveDuplicates()
                .allMatch(key -> key != null && key.matches("[0-9a-f]{32}"));

        mockMvc.perform(delete(URL)
                        .param("normalizedName", "ACMEUPDATED")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        create("AcmeUpdated", "P-001").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("슬래시 포함 key(A/S센터)도 쿼리파라미터 계약으로 수정·삭제할 수 있다")
    void slashKeyIsUpdatableAndDeletableViaQueryParam() throws Exception {
        create("A/S 센터", "P-001")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.normalizedName").value("A/S 센터"));

        mockMvc.perform(put(URL)
                        .param("normalizedName", "A/S 센터")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rawName\":\"A/S 센터\",\"partnerCode\":\"P-002\"}")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value("P-002"));

        mockMvc.perform(delete(URL)
                        .param("normalizedName", "A/S 센터")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        mockMvc.perform(get(URL).header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    @DisplayName("RequirePermission 실 HTTP에서 deposit-mapping CREATE deny는 403이다")
    void createRequiresDepositMappingPermission() throws Exception {
        when(dynamicPermissionClient.check(ACTOR, PAGE, PermissionAction.CREATE)).thenReturn(false);

        create("Acme", "P-001").andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("#810 R3: 거래처 조회 일시 장애는 stale이 아니라 targetStatus=UNAVAILABLE로 구분 표기한다")
    void listMarksLookupOutageAsUnavailableNotStale() throws Exception {
        create("Acme", "P-001").andExpect(status().isCreated());

        // 일시 장애(UNAVAILABLE): staleTarget=false + targetStatus=UNAVAILABLE + snapshot 코드 유지.
        when(partnerLookupClient.findByPartnerIdResult(PARTNER_ID))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());
        mockMvc.perform(get(URL).header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].targetStatus").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.data[0].staleTarget").value(false))
                .andExpect(jsonPath("$.data[0].partnerCode").value("P-001"));

        // 진짜 미존재(NOT_FOUND): 기존 계약대로 staleTarget=true 유지.
        when(partnerLookupClient.findByPartnerIdResult(PARTNER_ID))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        mockMvc.perform(get(URL).header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].staleTarget").value(true))
                .andExpect(jsonPath("$.data[0].targetStatus").doesNotExist());
    }

    @Test
    @DisplayName("key rename이 기존 활성 key와 충돌하면 409이고 조용히 병합하지 않는다")
    void renameConflictReturns409() throws Exception {
        create("Acme", "P-001").andExpect(status().isCreated());
        create("Other", "P-002").andExpect(status().isCreated());

        mockMvc.perform(put(URL)
                        .param("normalizedName", "ACME")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rawName\":\"Other\",\"partnerCode\":\"P-001\"}")
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    private org.springframework.test.web.servlet.ResultActions create(String rawName, String partnerCode)
            throws Exception {
        return mockMvc.perform(post(URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + "\"rawName\":\"" + rawName + "\",\"partnerCode\":\"" + partnerCode + "\"}")
                .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"));
    }
}
