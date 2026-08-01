package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.service.LedgerImageService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** 거래처 원장 자동저장이 실제 PostgreSQL commit 후 조회되는지 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LedgerSnapshotPersistenceIT extends AbstractPostgresIT {

    @Autowired private LedgerImageService ledgerImageService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("자동저장 후 SELECT로 snapshot과 작성자를 확인한다")
    void autosaveIsVisibleAfterCommitWithAuthor() {
        String partnerCode = "IT-LEDGER-" + UUID.randomUUID().toString().substring(0, 8);
        UUID partnerId = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        LocalDate from = LocalDate.of(2026, 8, 1);
        LocalDate to = LocalDate.of(2026, 8, 31);
        when(partnerLookupClient.findByPartnerCode(partnerCode))
                .thenReturn(java.util.Optional.of(new PartnerSummary(partnerId, partnerCode, "실저장 검증", "", "")));
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(partnerCode)).thenReturn(List.of());

        ledgerImageService.getLedger(partnerCode, from, to, actor);

        var row = jdbcTemplate.queryForMap("""
                SELECT batch_no, processed_by::text AS processed_by,
                       data_snapshot_json IS NOT NULL AS has_snapshot
                FROM tax_invoice_batches
                WHERE document_type = 'PARTNER_LEDGER' AND document_key = ?
                ORDER BY processed_at DESC
                LIMIT 1
                """, partnerCode);
        System.out.println("SELECT batch_no, processed_by, has_snapshot FROM tax_invoice_batches: " + row);
        assertThat(row.get("processed_by")).isEqualTo(actor.toString());
        assertThat(row.get("has_snapshot")).isEqualTo(true);
        assertThat(((String) row.get("batch_no")).length()).isLessThanOrEqualTo(20);
    }
}
