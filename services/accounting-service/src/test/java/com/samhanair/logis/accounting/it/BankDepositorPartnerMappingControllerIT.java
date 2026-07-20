package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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

    @Test
    @DisplayName("#832: 같은 revision 의 분산 changedAt 레거시 필드행도 실 Postgres 이력에서 하나의 operationOrdinal 로 묶인다")
    void historyGroupsScatteredLegacyRowsIntoOneOperationOverRealPostgres() throws Exception {
        // spec §2 D-03 ①다중필드 동일 ordinal ②레거시 changedAt 분산 — 실 Spring/Postgres 왕복 검증.
        // 단일 entity: rev1(생성) 2필드 @T0, rev2(수정) 2필드가 서로 다른 changedAt(@+2, @+3)로 분산.
        UUID entityId = UUID.fromString("0000aaaa-0000-0000-0000-000000000001");
        LocalDateTime t0 = LocalDateTime.of(2026, 7, 20, 9, 0, 0);
        insertMappingAudit(entityId, 1, "mapping.normalizedName", null, "LEGACYSCATTER", t0);
        insertMappingAudit(entityId, 1, "mapping.rawName", null, "Legacy", t0);
        insertMappingAudit(entityId, 2, "mapping.partnerCode", "P-001", "P-002", t0.plusMinutes(2));
        insertMappingAudit(entityId, 2, "mapping.reason", null, "UPDATE", t0.plusMinutes(3));

        List<Map<String, Object>> rows =
                com.jayway.jsonpath.JsonPath.read(historyJson("LEGACYSCATTER"), "$.data");

        assertThat(rows).hasSize(4);
        // rev2 의 두 필드행은 changedAt 이 갈라져도 동일 operationOrdinal(2)을 공유한다 —
        // deriveHistoryMetadata 의 (entityId,revisionNo) min(changedAt) 그룹핑을 되돌려 필드별로
        // 오분할하면 한 행이 ordinal 3 을 받아 아래 단언이 RED.
        assertThat(rows)
                .filteredOn(r -> intAt(r, "revisionNo") == 2)
                .hasSize(2)
                .allSatisfy(r -> assertThat(intAt(r, "operationOrdinal")).isEqualTo(2));
        // rev1(생성)은 oldest 작업 → operationOrdinal 1.
        assertThat(rows)
                .filteredOn(r -> intAt(r, "revisionNo") == 1)
                .hasSize(2)
                .allSatisfy(r -> assertThat(intAt(r, "operationOrdinal")).isEqualTo(1));
    }

    @Test
    @DisplayName("#832 R2: 작업 간 changedAt 교차 시에도 실 응답은 operationOrdinal DESC 연속이다")
    void historyKeepsCrossedOperationsContiguousOverRealPostgres() throws Exception {
        UUID entityId = UUID.fromString("0000cccc-0000-0000-0000-000000000003");
        LocalDateTime base = LocalDateTime.of(2026, 7, 20, 10, 0, 0);
        // repository total-order는 A(10:03) → B(10:02) → A(10:01)로 작업을 교차시킨다.
        insertMappingAudit(entityId, 1, "mapping.normalizedName", null, "R2-CROSS-TIME", base.plusMinutes(3));
        insertMappingAudit(entityId, 2, "mapping.reason", null, "B", base.plusMinutes(2));
        insertMappingAudit(entityId, 1, "mapping.partnerCode", null, "A-EARLY", base.plusMinutes(1));

        List<Map<String, Object>> rows =
                com.jayway.jsonpath.JsonPath.read(historyJson("R2-CROSS-TIME"), "$.data");

        // #832 R2: min(changedAt) 계약으로 A=1/B=2를 바인딩하고, 응답 작업은 [2,1,1] 연속이어야 한다.
        assertThat(rows).hasSize(3);
        assertThat(rows).extracting(r -> intAt(r, "operationOrdinal"))
                .containsExactly(2, 1, 1);
        assertThat(rows).extracting(r -> r.get("newValue"))
                .containsExactly("B", "R2-CROSS-TIME", "A-EARLY");
        assertThat(rows).filteredOn(r -> intAt(r, "revisionNo") == 1)
                .hasSize(2)
                .allSatisfy(r -> assertThat(intAt(r, "operationOrdinal")).isEqualTo(1));
        assertThat(rows).filteredOn(r -> intAt(r, "revisionNo") == 2)
                .hasSize(1)
                .allSatisfy(r -> assertThat(intAt(r, "operationOrdinal")).isEqualTo(2));
    }

    @Test
    @DisplayName("#832: 실 Postgres 이력에서 2세대 동시각 tiebreak·비퇴화 ordinal 이 결정적으로 파생된다")
    void historyDerivesStableGenerationsAndNonDegenerateOrdinalsOverRealPostgres() throws Exception {
        // spec §2 D-03 ③2세대 동시각 tiebreak ④반복안정 + 비퇴화 ordinal(전역 ordinal≠entity-local
        // revisionNo). 같은 normalizedName 을 삭제+재생성한 2 entity(동시각) + 한쪽 후속 수정 = 3 작업.
        UUID first = UUID.fromString("0000aaaa-0000-0000-0000-000000000001");   // UUID.toString asc → 1세대
        UUID second = UUID.fromString("0000bbbb-0000-0000-0000-000000000002");  // → 2세대
        LocalDateTime same = LocalDateTime.of(2026, 7, 20, 10, 0, 0);           // 1·2세대 최초 등장 동시각
        LocalDateTime later = same.plusMinutes(10);                             // 1세대 후속 수정
        insertMappingAudit(first, 1, "mapping.normalizedName", null, "TWOGEN", same);
        insertMappingAudit(first, 1, "mapping.partnerCode", null, "P-001", same);
        insertMappingAudit(second, 1, "mapping.normalizedName", null, "TWOGEN", same);
        insertMappingAudit(second, 1, "mapping.partnerCode", null, "P-002", same);
        insertMappingAudit(first, 2, "mapping.partnerCode", "P-001", "P-003", later);

        String json = historyJson("TWOGEN");
        List<Map<String, Object>> rows = com.jayway.jsonpath.JsonPath.read(json, "$.data");

        assertThat(rows).hasSize(5);
        // 1세대 최초 작업 (P-001): generation 1, ordinal 1, revisionNo 1.
        assertThat(rows)
                .filteredOn(r -> "P-001".equals(r.get("newValue")))
                .hasSize(1)
                .allSatisfy(r -> {
                    assertThat(intAt(r, "generation")).isEqualTo(1);
                    assertThat(intAt(r, "operationOrdinal")).isEqualTo(1);
                    assertThat(intAt(r, "revisionNo")).isEqualTo(1);
                });
        // 2세대 재생성 (P-002): 동시각 tiebreak(UUID asc)로 generation 2, 두 번째 작업 ordinal 2.
        // revisionNo(1)≠operationOrdinal(2) — operationOrdinal=revisionNo 하드코딩 stub 이면 RED.
        // tiebreak 방향(UUID desc 등)을 뒤집으면 generation 1·ordinal 1 이 되어 RED.
        assertThat(rows)
                .filteredOn(r -> "P-002".equals(r.get("newValue")))
                .hasSize(1)
                .allSatisfy(r -> {
                    assertThat(intAt(r, "generation")).isEqualTo(2);
                    assertThat(intAt(r, "operationOrdinal")).isEqualTo(2);
                    assertThat(intAt(r, "revisionNo")).isEqualTo(1);
                });
        // 1세대 후속 수정 (P-003): 세 번째 작업 ordinal 3, revisionNo 2 — 비퇴화(3≠2).
        assertThat(rows)
                .filteredOn(r -> "P-003".equals(r.get("newValue")))
                .hasSize(1)
                .allSatisfy(r -> {
                    assertThat(intAt(r, "generation")).isEqualTo(1);
                    assertThat(intAt(r, "operationOrdinal")).isEqualTo(3);
                    assertThat(intAt(r, "revisionNo")).isEqualTo(2);
                });
        // ④ 반복 조회 안정성: 동일 순서·ordinal·generation·entryKey (파생·정렬이 결정적).
        List<Map<String, Object>> rows2 =
                com.jayway.jsonpath.JsonPath.read(historyJson("TWOGEN"), "$.data");
        assertThat(rows2).isEqualTo(rows);
    }

    /**
     * #832: 실 Postgres 매핑 audit 행 직접 시드 — changedAt/revisionNo/entityId 를 결정적으로 고정한다.
     * old/new 값은 {@code ?::text} 로 캐스팅해 null 바인딩 시 타입 미결정 오류를 피한다.
     * mapping.normalizedName 행의 new_value 가 조회 키가 되어 entity 가 이력 조회에 편입된다.
     */
    private void insertMappingAudit(UUID entityId, int revisionNo, String fieldName,
                                    String oldValue, String newValue, LocalDateTime changedAt) {
        java.sql.Timestamp at = java.sql.Timestamp.valueOf(changedAt);
        jdbcTemplate.update("""
                INSERT INTO accounting_audit_logs
                    (id, entity_id, revision_no, actor_id, actor_name, actor_color,
                     field_name, old_value, new_value, changed_at, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, '사용자', NULL, ?, ?::text, ?::text, ?, ?, 'it', FALSE)
                """,
                UUID.randomUUID(), entityId, revisionNo, ACTOR,
                fieldName, oldValue, newValue, at, at);
    }

    private String historyJson(String normalizedName) throws Exception {
        return mockMvc.perform(get(URL + "/history")
                        .param("normalizedName", normalizedName)
                        .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private static int intAt(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).intValue();
    }

    private org.springframework.test.web.servlet.ResultActions create(String rawName, String partnerCode)
            throws Exception {
        return mockMvc.perform(post(URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + "\"rawName\":\"" + rawName + "\",\"partnerCode\":\"" + partnerCode + "\"}")
                .header("X-User-Id", ACTOR.toString()).header("X-User-Role", "ACCOUNTANT"));
    }
}
