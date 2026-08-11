package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SalesCommissionSettlementCalculationServiceTest {

    @Mock SalesCommissionSettlementRepository repository;
    @Mock SalesCommissionSettlementNumberService numberService;

    @Test
    void calculate_records_the_contract_version_and_result_snapshot() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                1, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        SalesCommissionSettlementCalculationInput input =
                new SalesCommissionSettlementCalculationInput(
                        new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                        false, null);
        SalesCommissionSettlement draft = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService,
                        new SalesCommissionSettlementCalculator());

        SalesCommissionSettlement saved = service.calculate(id, contract, input);

        assertThat(saved.getRateContract()).isSameAs(contract);
        assertThat(saved.getExpenseAmount()).isEqualByComparingTo("-800");
        verify(repository).save(draft);
    }
}
