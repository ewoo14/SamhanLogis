package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * V56__add_journal_cash_receipt_id.sql 의 3-pass backfill UPDATE 회귀 IT (#772 리뷰 지적 FIX).
 *
 * <p>기존 스위트는 fresh Testcontainers DB 에서 confirm/updateConfirmed/cancel 을 호출하면
 * {@code JournalService.postAutoJournal}/{@code autoReverse} 가 신규 Journal 생성 시점에
 * {@code linkCashReceipt} 로 {@code cash_receipt_id} 를 즉시 채우기 때문에, V56 의 backfill UPDATE
 * 3종이 "이미 채워진 행" 에만 실행되어 사실상 no-op 로 계속 green 이었다 — 즉 backfill SQL 자체는
 * 한 번도 "채워지지 않은 과거 데이터" 를 상대로 실행된 적이 없다.
 *
 * <p>본 IT 는 실 서비스 경로(confirm → 수정 ×2 → 취소)로 원분개·역분개 3세대를 만든다. 세대 1·2 는
 * updateConfirmed 재게시로 {@code cash_receipts.journal_id/reverse_journal_id} 가 최신 세대(3)로
 * 덮여써 orphaned 상태가 되고, 세대 3 만 "현재" 링크로 남는다 — 이는 리뷰가 지적한 INCOMPLETE 시나리오
 * (구 backfill 의 단일 OR-join 은 세대 1·2, 즉 6건 중 4건을 영구히 놓친다)를 실 데이터로 재현한다.
 * 그 후 6건 전부 {@code cash_receipt_id = NULL} 로 되돌려 "마이그레이션 적용 전" 상태를 재현하고,
 * V56 원문 그대로의 3-pass UPDATE 를 재실행해 6건 전부 정확히 복원되는지 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class JournalCashReceiptIdBackfillIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/cash-receipts";
    private static final String ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000772";
    private static final UUID PARTNER_ID = UUID.fromString("20000000-0000-0000-0000-000000000772");
    private static final String PARTNER_CODE = "P-CR-BF1";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpExternalClients() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(eq(PARTNER_CODE))).thenReturn(Optional.of(
                new PartnerSummary(PARTNER_ID, PARTNER_CODE, "백필 회귀 거래처", "555-55-55555", "서울")));
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of(
                PARTNER_ID, new PartnerSummary(PARTNER_ID, PARTNER_CODE, "백필 회귀 거래처", "555-55-55555", "서울")));
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @Test
    @DisplayName("V56 3-pass backfill — confirm/수정×2/취소 edit-chain 이 만든 orphaned 원분개·역분개 6건 전부를 복원한다")
    void backfillRestoresOrphanedOriginalsAndReversalsAfterEditChain() throws Exception {
        // 1) 실 서비스 경로로 edit-chain 시드 — confirm(세대1) → 수정(세대2) → 수정(세대3) → 취소.
        String receiptId = data(createReceipt(createBody("70000"))).get("id").asText();
        UUID receiptUuid = UUID.fromString(receiptId);

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID journalGen1 = receiptJournalId(receiptId);

        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("71000"))))
                .andExpect(status().isOk());
        UUID journalGen2 = receiptJournalId(receiptId);
        UUID reversalGen1 = (UUID) journal(journalGen1).get("reversed_journal_id");

        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("72000"))))
                .andExpect(status().isOk());
        UUID journalGen3 = receiptJournalId(receiptId);
        UUID reversalGen2 = (UUID) journal(journalGen2).get("reversed_journal_id");

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID reversalGen3 = receiptReverseJournalId(receiptId);

        List<UUID> allJournals = List.of(
                journalGen1, reversalGen1, journalGen2, reversalGen2, journalGen3, reversalGen3);
        assertThat(allJournals).doesNotContainNull();
        assertThat(allJournals).as("6개 세대가 서로 다른 journal 이어야 orphaned 세대가 실제로 만들어진 것")
                .doesNotHaveDuplicates();
        // cash_receipts 의 "현재" 링크는 마지막 세대(3)만 가리킨다 — 세대 1·2 는 orphaned.
        assertThat(receiptJournalId(receiptId)).isEqualTo(journalGen3);
        assertThat(reversalGen3).isEqualTo((UUID) journal(journalGen3).get("reversed_journal_id"));

        // 2) 신규 Java 경로(JournalService.postAutoJournal/autoReverse → Journal.linkCashReceipt)가
        // 6건 모두 이미 채웠음을 먼저 확인한다 — 그래야 "NULL 로 되돌린 뒤 backfill 로 복원" 검증이
        // 유의미하다(그렇지 않으면 애초에 NULL 이었던 것을 backfill 이 다시 NULL 로 두는 false-green).
        for (UUID journalId : allJournals) {
            assertThat((UUID) journal(journalId).get("cash_receipt_id"))
                    .as("journal %s 는 실 서비스 경로에서 이미 cash_receipt_id 가 채워져야 한다", journalId)
                    .isEqualTo(receiptUuid);
        }

        // 3) 마이그레이션 적용 전 상태로 되돌린다 — 6건 전부 NULL.
        for (UUID journalId : allJournals) {
            jdbcTemplate.update("UPDATE journals SET cash_receipt_id = NULL WHERE id = ?", journalId);
        }
        for (UUID journalId : allJournals) {
            assertThat((UUID) journal(journalId).get("cash_receipt_id")).isNull();
        }

        // 4) V56__add_journal_cash_receipt_id.sql 의 3-pass backfill UPDATE 를 원문 그대로 재실행한다.
        runV56BackfillPasses();

        // 5) 6건 전부 정확한 CashReceipt UUID 로 복원됐는지 — orphaned 원분개·역분개 포함 전수.
        for (UUID journalId : allJournals) {
            assertThat((UUID) journal(journalId).get("cash_receipt_id"))
                    .as("journal %s 는 backfill 후 cash_receipt_id 가 복원돼야 한다", journalId)
                    .isEqualTo(receiptUuid);
        }
        // 원분개 3세대 전부 — cash_receipt_id == source_ref_id(CashReceipt UUID, 생성 시 고정).
        for (UUID original : List.of(journalGen1, journalGen2, journalGen3)) {
            Map<String, Object> row = journal(original);
            assertThat(row.get("cash_receipt_id")).isEqualTo(row.get("source_ref_id"));
        }
        // 역분개 3세대 전부 — 각자 원분개의 cash_receipt_id 를 그대로 승계.
        assertThat(journal(reversalGen1).get("cash_receipt_id")).isEqualTo(journal(journalGen1).get("cash_receipt_id"));
        assertThat(journal(reversalGen2).get("cash_receipt_id")).isEqualTo(journal(journalGen2).get("cash_receipt_id"));
        assertThat(journal(reversalGen3).get("cash_receipt_id")).isEqualTo(journal(journalGen3).get("cash_receipt_id"));

        // 6) 이 CashReceipt 에 속한 CASH_RECEIPT journal 중 NULL 로 남은 건 하나도 없어야 한다
        // (핵심 재무데이터 정합성 가드 — placeholders 는 allJournals 크기(6)에 맞춘다).
        String placeholders = String.join(",", java.util.Collections.nCopies(allJournals.size(), "?"));
        Integer stillNull = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM journals WHERE cash_receipt_id IS NULL AND id IN (" + placeholders + ")",
                Integer.class, allJournals.toArray());
        assertThat(stillNull).isZero();
    }

    /** V56__add_journal_cash_receipt_id.sql 의 3-pass backfill UPDATE 원문(verbatim). */
    private void runV56BackfillPasses() {
        jdbcTemplate.update("""
                UPDATE journals j SET cash_receipt_id = cr.id
                FROM cash_receipts cr
                WHERE cr.journal_id = j.id AND cr.is_deleted = false AND j.cash_receipt_id IS NULL
                """);
        jdbcTemplate.update("""
                UPDATE journals j SET cash_receipt_id = j.source_ref_id
                FROM cash_receipts cr
                WHERE j.source_type = 'CASH_RECEIPT' AND j.source_ref_id = cr.id
                  AND cr.is_deleted = false AND j.cash_receipt_id IS NULL
                """);
        jdbcTemplate.update("""
                UPDATE journals rev SET cash_receipt_id = orig.cash_receipt_id
                FROM journals orig
                WHERE rev.source_type = 'CASH_RECEIPT' AND rev.source_ref_id = orig.id
                  AND orig.cash_receipt_id IS NOT NULL AND rev.cash_receipt_id IS NULL
                """);
    }

    private Map<String, Object> journal(UUID journalId) {
        return jdbcTemplate.queryForMap(
                """
                SELECT status, source_type, source_ref_id, reversed_journal_id, cash_receipt_id
                  FROM journals
                 WHERE id = ?::uuid
                """,
                journalId.toString());
    }

    private UUID receiptJournalId(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT journal_id FROM cash_receipts WHERE id = ?::uuid", UUID.class, receiptId);
    }

    private UUID receiptReverseJournalId(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT reverse_journal_id FROM cash_receipts WHERE id = ?::uuid", UUID.class, receiptId);
    }

    private MvcResult createReceipt(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private Map<String, Object> createBody(String amount) {
        Map<String, Object> body = new HashMap<>();
        body.put("partnerCode", PARTNER_CODE);
        body.put("amount", new BigDecimal(amount));
        body.put("transactionDate", "2026-07-03");
        body.put("memo", "백필 회귀 시드");
        return body;
    }

    private Map<String, Object> updateBody(String amount) {
        Map<String, Object> body = createBody(amount);
        body.put("memo", "백필 회귀 수정");
        return body;
    }

    private JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data");
    }
}
