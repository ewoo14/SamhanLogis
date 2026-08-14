package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import com.samhanair.logis.security.permission.DynamicPermissionClient;

/** 회계전표 soft-delete 시 활성 allocation 고아를 만들지 않는 DB 방어선 검증. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class AccountingSlipIntegrityMigrationIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    void deleted_sales_slip_cannot_leave_active_allocation_and_quarantine_is_auditable() {
        UUID slipId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID allocationId = UUID.randomUUID();
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slips
                    (id, slip_no, slip_date, partner_id, partner_code, partner_name,
                     tax_type, status, total_supply_amount, total_vat_amount, total_amount,
                     created_by, modified_by)
                VALUES (?, ?, DATE '2026-08-14', ?, 'P-INTEGRITY', '무결성 테스트',
                        'TAXABLE', 'POSTED', 100, 10, 110, 'test', 'test')
                """, slipId, "IT-" + slipId, UUID.randomUUID());
        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slip_lines
                    (id, slip_id, line_no, product_code, product_name, qty, unit_price,
                     supply_amount, vat_amount, line_total, created_by, modified_by)
                VALUES (?, ?, 1, 'P-1', '무결성 테스트 품목', 1, 100, 100, 10, 110, 'test', 'test')
                """, lineId, slipId);
        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slip_allocations
                    (id, sales_slip_line_id, source_slip_id, source_slip_no, source_line_id,
                     source_line_no, allocated_qty, allocated_amount, created_by, modified_by)
                VALUES (?, ?, ?, 'SRC-IT-1', ?, 1, 1, 110, 'test', 'test')
                """, allocationId, lineId, sourceSlipId, sourceLineId);

        jdbcTemplate.update("UPDATE sales_accounting_slips SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'test' WHERE id = ?", slipId);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sales_accounting_slip_allocations WHERE id = ? AND is_deleted = FALSE",
                Integer.class, allocationId)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM accounting_slip_integrity_quarantine WHERE allocation_id = ? AND restored_at IS NULL",
                Integer.class, allocationId)).isEqualTo(1);
    }
}
