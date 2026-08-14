package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.service.DailyClosingVerificationService;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** 회계전표 삭제 lifecycle과 일마감 게이트를 PostgreSQL 격리 컨테이너에서 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class SalesAccountingSlipLifecycleIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");
    private static final LocalDate DATE = LocalDate.of(2098, 12, 31);

    @Autowired private SalesAccountingSlipService service;
    @Autowired private SalesAccountingSlipRepository slipRepository;
    @Autowired private SalesAccountingSlipAllocationRepository allocationRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private DailyClosingVerificationService dailyClosingVerificationService;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;

    @Test
    void deletion_gate_blocks_before_any_soft_delete_and_returns_conflict() {
        SalesAccountingSlip slip = saveSlip("SAS-IT-GATE");
        when(dailyClosingVerificationService.requireLockedClosing(
                DATE, DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP, PARTNER_ID))
                .thenReturn(new DailyClosingVerificationService.VerificationResult(
                        DailyClosingVerificationService.Status.CLOSING_NOT_FOUND,
                        "일마감을 먼저 완료해 주세요"));

        assertThatThrownBy(() -> service.delete(slip.getSlipNo(), "it-actor"))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> assertThat(((BusinessException) error).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        assertThat(slipRepository.findBySlipNo(slip.getSlipNo())).isPresent();
        assertThat(slipRepository.findBySlipNo(slip.getSlipNo()).orElseThrow().getIsDeleted()).isFalse();
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId(slip)))
                .isEqualByComparingTo("110");
    }

    @Test
    void successful_delete_is_soft_only_and_excludes_allocation_from_active_sum() {
        SalesAccountingSlip slip = saveSlip("SAS-IT-DELETE");
        UUID sourceLineId = sourceLineId(slip);
        when(dailyClosingVerificationService.requireLockedClosing(
                DATE, DailyClosingKind.SALES, DailyClosingSourceKind.SALES_SLIP, PARTNER_ID))
                .thenReturn(new DailyClosingVerificationService.VerificationResult(
                        DailyClosingVerificationService.Status.VERIFIED, ""));

        service.delete(slip.getSlipNo(), "it-actor");

        assertThat(slipRepository.findBySlipNo(slip.getSlipNo())).isEmpty();
        assertThat(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sales_accounting_slips WHERE slip_no = ? AND is_deleted = TRUE",
                Integer.class, slip.getSlipNo())).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sales_accounting_slip_allocations WHERE source_line_id = ? AND is_deleted = TRUE",
                Integer.class, sourceLineId)).isEqualTo(1);
    }

    private SalesAccountingSlip saveSlip(String slipNo) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, DATE, PARTNER_ID, "P-IT", "IT partner", SalesTaxType.TAXABLE, "lifecycle");
        UUID sourceLineId = UUID.randomUUID();
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                slip, 1, "SKU-IT", "IT item", BigDecimal.ONE, new BigDecimal("100"),
                new BigDecimal("100"), new BigDecimal("10"), new BigDecimal("110"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(
                line, UUID.randomUUID(), "OUT-IT", sourceLineId, 1,
                BigDecimal.ONE, new BigDecimal("110")));
        slip.getLines().add(line);
        slip.recalcTotals();
        return slipRepository.saveAndFlush(slip);
    }

    private UUID sourceLineId(SalesAccountingSlip slip) {
        return slip.getLines().get(0).getAllocations().get(0).getSourceLineId();
    }
}
