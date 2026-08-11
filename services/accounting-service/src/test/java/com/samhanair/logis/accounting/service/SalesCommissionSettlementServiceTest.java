package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

@ExtendWith(MockitoExtension.class)
class SalesCommissionSettlementServiceTest {

    @Mock SalesCommissionSettlementRepository repository;
    @Mock SalesCommissionSettlementNumberService numberService;

    @Test
    void createDraft_doesNotAllocateNumber() {
        LocalDate date = LocalDate.of(2026, 8, 11);
        when(repository.save(any(SalesCommissionSettlement.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService);

        SalesCommissionSettlement saved = service.createDraft(date);

        assertThat(saved.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(saved.getDocumentNo()).isNull();
    }

    @Test
    void confirm_allocatesNumber_thenSavesConfirmedSettlement() {
        UUID id = UUID.randomUUID();
        LocalDate date = LocalDate.of(2026, 8, 11);
        SalesCommissionSettlement draft = SalesCommissionSettlement.createDraft(date);
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(numberService.next(date)).thenReturn("2026/08/11-1");
        when(repository.save(draft)).thenReturn(draft);
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService);

        SalesCommissionSettlement confirmed = service.confirm(id);

        assertThat(confirmed.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(confirmed.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
        verify(numberService).next(date);
        verify(repository).save(draft);
    }

    @ParameterizedTest(name = "documentNo={0}")
    @NullSource
    @ValueSource(strings = {"", "   "})
    void findByDocumentNo_rejectsNullOrBlank_beforeRepository(String documentNo) {
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService);

        assertThatThrownBy(() -> service.findByDocumentNo(documentNo))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verifyNoInteractions(repository);
    }

    @Test
    void findByDocumentNo_trimsInputBeforeRepositoryLookup() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1");
        when(repository.findByDocumentNoAndIsDeletedFalse("2026/08/11-1"))
                .thenReturn(Optional.of(settlement));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService);

        SalesCommissionSettlement loaded = service.findByDocumentNo("  2026/08/11-1  ");

        assertThat(loaded).isSameAs(settlement);
        verify(repository).findByDocumentNoAndIsDeletedFalse("2026/08/11-1");
    }

    @Test
    void findByDocumentNo_returnsNotFoundForUnknownValidNumber() {
        when(repository.findByDocumentNoAndIsDeletedFalse("2099/12/28-999"))
                .thenReturn(Optional.empty());
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, numberService);

        assertThatThrownBy(() -> service.findByDocumentNo("2099/12/28-999"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }
}
