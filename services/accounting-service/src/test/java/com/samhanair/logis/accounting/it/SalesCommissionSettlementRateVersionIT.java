package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.repository.SalesCommissionRateContractRepository;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** versioned 계약 선택과 확정 정산 snapshot의 PostgreSQL 왕복 회귀. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class SalesCommissionSettlementRateVersionIT extends AbstractPostgresIT {

    private static final LocalDate SETTLEMENT_DATE = LocalDate.of(2099, 12, 30);
    private static final int VERSION_1 = 1101;
    private static final int VERSION_2 = 1102;

    @Autowired private SalesCommissionSettlementService settlementService;
    @Autowired private SalesCommissionRateContractRepository rateContractRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanFixtures() {
        jdbcTemplate.update("DELETE FROM sales_commission_settlements WHERE settlement_date = ?",
                SETTLEMENT_DATE);
        jdbcTemplate.update("DELETE FROM sales_commission_rate_contracts WHERE version_no IN (?, ?)",
                VERSION_1, VERSION_2);
        entityManager.clear();
    }

    @Test
    void persisted_versions_keep_their_own_confirmed_settlement_snapshots_after_reload() {
        rateContractRepository.saveAndFlush(contract(VERSION_1, "0.08"));

        var oldDraft = settlementService.createDraft(SETTLEMENT_DATE);
        settlementService.calculate(oldDraft.getId(), VERSION_1, input());
        var oldConfirmed = settlementService.confirm(oldDraft.getId());

        rateContractRepository.saveAndFlush(contract(VERSION_2, "0.07"));
        var newDraft = settlementService.createDraft(SETTLEMENT_DATE);
        settlementService.calculate(newDraft.getId(), VERSION_2, input());
        var newConfirmed = settlementService.confirm(newDraft.getId());
        entityManager.clear();

        var oldSettlement = settlementService.findByDocumentNo(oldConfirmed.getDocumentNo());
        var newSettlement = settlementService.findByDocumentNo(newConfirmed.getDocumentNo());

        assertThat(oldSettlement.getRateContract().getVersionNo()).isEqualTo(VERSION_1);
        assertThat(oldSettlement.getAppliedExpenseRate()).isEqualByComparingTo("0.08");
        assertThat(oldSettlement.getExpenseAmount()).isEqualByComparingTo("-800");
        assertThat(newSettlement.getRateContract().getVersionNo()).isEqualTo(VERSION_2);
        assertThat(newSettlement.getAppliedExpenseRate()).isEqualByComparingTo("0.07");
        assertThat(newSettlement.getExpenseAmount()).isEqualByComparingTo("-700");
    }

    @Test
    void soft_deleted_contract_cannot_calculate_new_draft_but_remains_visible_on_old_snapshot() {
        rateContractRepository.saveAndFlush(contract(VERSION_1, "0.08"));
        var oldDraft = settlementService.createDraft(SETTLEMENT_DATE);
        settlementService.calculate(oldDraft.getId(), VERSION_1, input());
        var oldConfirmed = settlementService.confirm(oldDraft.getId());

        SalesCommissionRateContract contract = rateContractRepository
                .findByVersionNoAndIsDeletedFalse(VERSION_1)
                .orElseThrow();
        contract.markDeleted("test");
        rateContractRepository.saveAndFlush(contract);
        entityManager.clear();

        var newDraft = settlementService.createDraft(SETTLEMENT_DATE);
        assertThatThrownBy(() -> settlementService.calculate(newDraft.getId(), VERSION_1, input()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));

        var oldSettlement = settlementService.findByDocumentNo(oldConfirmed.getDocumentNo());
        assertThat(oldSettlement.getRateContract().getVersionNo()).isEqualTo(VERSION_1);
        assertThat(oldSettlement.getAppliedExpenseRate()).isEqualByComparingTo("0.08");
        assertThat(oldSettlement.getExpenseAmount()).isEqualByComparingTo("-800");
    }

    private static SalesCommissionRateContract contract(int version, String expenseRate) {
        return SalesCommissionRateContract.create(
                version, new BigDecimal("0.03"), new BigDecimal(expenseRate),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
    }

    private static SalesCommissionSettlementCalculationInput input() {
        return new SalesCommissionSettlementCalculationInput(
                new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                false, null);
    }
}
