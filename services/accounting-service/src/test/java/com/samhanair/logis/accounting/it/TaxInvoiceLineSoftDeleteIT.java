package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/**
 * MIG-12 follow-up: tax_invoice_lines partial UNIQUE 회귀 가드.
 *
 * <p>V24 의 full UNIQUE 는 soft-deleted line 재발행을 막는다. V32 이후에는
 * {@code WHERE is_deleted = FALSE} partial UNIQUE 만 active row 를 검사해야 한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TaxInvoiceLineSoftDeleteIT extends AbstractPostgresIT {

    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.accounting.client.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("soft-delete 된 line_no 는 같은 세금계산서에 재발행 가능")
    void softDeletedLineNo_canBeReissued() {
        UUID invoiceId = insertInvoice("MIG12-SD-1");
        insertLine(invoiceId, 1, false);

        jdbcTemplate.update("""
                UPDATE tax_invoice_lines
                   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'it'
                 WHERE tax_invoice_id = ? AND line_no = 1
                """, invoiceId);

        insertLine(invoiceId, 1, false);

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM tax_invoice_lines
                 WHERE tax_invoice_id = ? AND line_no = 1 AND is_deleted = FALSE
                """, Integer.class, invoiceId);
        Integer totalCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM tax_invoice_lines
                 WHERE tax_invoice_id = ? AND line_no = 1
                """, Integer.class, invoiceId);

        assertThat(activeCount).isEqualTo(1);
        assertThat(totalCount).isEqualTo(2);
    }

    @Test
    @DisplayName("active line_no 중복은 UNIQUE 충돌")
    void duplicateActiveLineNo_isRejected() {
        UUID invoiceId = insertInvoice("MIG12-DUP-1");
        insertLine(invoiceId, 1, false);

        assertThatThrownBy(() -> insertLine(invoiceId, 1, false))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("서로 다른 active line_no 2건은 정상 저장")
    void twoActiveLines_areAllowed() {
        UUID invoiceId = insertInvoice("MIG12-OK-1");

        insertLine(invoiceId, 1, false);
        insertLine(invoiceId, 2, false);

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM tax_invoice_lines
                 WHERE tax_invoice_id = ? AND is_deleted = FALSE
                """, Integer.class, invoiceId);

        assertThat(activeCount).isEqualTo(2);
    }

    private UUID insertInvoice(String taxInvoiceNo) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO tax_invoices (
                    id, tax_invoice_no, partner_id, partner_code, partner_business_no,
                    partner_name, partner_address, supply_date, supply_amount, vat_amount,
                    total_amount, invoice_type, direction, status, issued_at, issued_by,
                    description, version, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, 'P-MIG12', '123-45-67890',
                    'MIG12 테스트 거래처', '서울', ?, 1000.00, 100.00,
                    1100.00, 'SALES', 'OUTBOUND', 'ISSUED', NOW(), 'it',
                    'MIG-12 partial unique IT', 0, NOW(), 'it', FALSE
                )
                """, id, taxInvoiceNo, UUID.randomUUID(), LocalDate.of(2026, 5, 21));
        return id;
    }

    private void insertLine(UUID invoiceId, int lineNo, boolean deleted) {
        jdbcTemplate.update("""
                INSERT INTO tax_invoice_lines (
                    id, tax_invoice_id, line_no, item_name, spec, unit, quantity,
                    unit_price, supply_amount, vat_amount, memo, created_at, created_by,
                    is_deleted
                ) VALUES (
                    ?, ?, ?, '운임', 'MIG12', '건', 1.00,
                    1000.00, 1000.00, 100.00, NULL, NOW(), 'it',
                    ?
                )
                """, UUID.randomUUID(), invoiceId, lineNo, deleted);
    }
}
