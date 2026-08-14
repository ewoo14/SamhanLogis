package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** 삭제·격리된 allocation이 공통 연결 read model 후보에 섞이지 않는지 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class AccountingSlipLinkAllocationRepositoryIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SalesAccountingSlipAllocationRepository repository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    void 삭제된_회계전표_아래의_활성_allocation은_연결_read_model에서_제외된다() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        UUID activeSlipId = UUID.randomUUID();
        UUID activeLineId = UUID.randomUUID();
        UUID deletedSlipId = UUID.randomUUID();
        UUID deletedLineId = UUID.randomUUID();

        insertSalesSlip(activeSlipId, "IT-LINK-ACTIVE", false);
        insertSalesSlip(deletedSlipId, "IT-LINK-DELETED", true);
        insertSalesLine(activeLineId, activeSlipId);
        insertSalesLine(deletedLineId, deletedSlipId);
        insertAllocation(UUID.randomUUID(), activeLineId, sourceSlipId, sourceLineId);
        insertAllocation(UUID.randomUUID(), deletedLineId, sourceSlipId, sourceLineId);

        assertThat(repository.findActiveBySourceSlipId(sourceSlipId))
                .extracting(SalesAccountingSlipAllocation::getSourceSlipNo)
                .containsExactly("SRC-IT-LINK");
    }

    private void insertSalesSlip(UUID id, String slipNo, boolean deleted) {
        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slips
                    (id, slip_no, slip_date, partner_id, partner_code, partner_name,
                     tax_type, status, total_supply_amount, total_vat_amount, total_amount,
                     is_deleted, created_by, modified_by)
                VALUES (?, ?, DATE '2026-08-14', ?, 'P-IT-LINK', '연결 테스트',
                        'TAXABLE', 'DRAFT', 100, 10, 110, ?, 'test', 'test')
                """, id, slipNo, UUID.randomUUID(), deleted);
    }

    private void insertSalesLine(UUID id, UUID slipId) {
        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slip_lines
                    (id, slip_id, line_no, product_code, product_name, qty, unit_price,
                     supply_amount, vat_amount, line_total, created_by, modified_by)
                VALUES (?, ?, 1, 'P-IT-LINK', '연결 테스트', 1, 100, 100, 10, 110, 'test', 'test')
                """, id, slipId);
    }

    private void insertAllocation(UUID id, UUID lineId, UUID sourceSlipId, UUID sourceLineId) {
        jdbcTemplate.update("""
                INSERT INTO sales_accounting_slip_allocations
                    (id, sales_slip_line_id, source_slip_id, source_slip_no, source_line_id,
                     source_line_no, allocated_qty, allocated_amount, created_by, modified_by)
                VALUES (?, ?, ?, 'SRC-IT-LINK', ?, 1, 1, 110, 'test', 'test')
                """, id, lineId, sourceSlipId, sourceLineId);
    }
}
