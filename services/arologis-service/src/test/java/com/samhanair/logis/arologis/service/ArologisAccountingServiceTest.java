package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.AccountType;
import com.samhanair.logis.arologis.domain.ArologisCashTxn;
import com.samhanair.logis.arologis.domain.ArologisSimpleAccount;
import com.samhanair.logis.arologis.domain.CashTxnType;
import com.samhanair.logis.arologis.repository.ArologisCashTxnRepository;
import com.samhanair.logis.arologis.repository.ArologisSimpleAccountRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 아로로지스 간이 회계 서비스 단위 검증.
 *
 * <p>단식부기 — 분개/차대 검증 없이 수입/지출 합계와 잔액(수입−지출)을 {@link BigDecimal} 로 정확히
 * 계산한다. 계정과목 존재/유형 정합성 거부와 soft-delete 동작을 함께 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class ArologisAccountingServiceTest {

    @Mock private ArologisCashTxnRepository cashTxnRepository;
    @Mock private ArologisSimpleAccountRepository simpleAccountRepository;

    private ArologisAccountingService service;

    @BeforeEach
    void setUp() {
        service = new ArologisAccountingService(cashTxnRepository, simpleAccountRepository);
    }

    @Test
    void create_persistsTxnWhenAccountExistsAndTypeMatches() {
        ArologisSimpleAccount account = ArologisSimpleAccount.create("4010", "운송수입", AccountType.INCOME, 40, true);
        when(simpleAccountRepository.findByCodeAndIsDeletedFalse("4010")).thenReturn(Optional.of(account));
        when(cashTxnRepository.save(any(ArologisCashTxn.class))).thenAnswer(inv -> inv.getArgument(0));

        ArologisAccountingService.CashTxnView view = service.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.INCOME, "한진택배",
                        new BigDecimal("150000.00"), "4010", "6월 운송료"),
                "tester");

        verify(cashTxnRepository).save(any(ArologisCashTxn.class));
        assertThat(view.accountCode()).isEqualTo("4010");
        assertThat(view.accountName()).isEqualTo("운송수입");
        assertThat(view.amount()).isEqualByComparingTo("150000.00");
    }

    @Test
    void create_rejectsUnknownAccountCodeWithNotFound() {
        when(simpleAccountRepository.findByCodeAndIsDeletedFalse("9999")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.EXPENSE, null,
                        new BigDecimal("1000.00"), "9999", null),
                "tester"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.NOT_FOUND);

        verify(cashTxnRepository, never()).save(any());
    }

    @Test
    void create_rejectsIncomeTxnWithExpenseAccount() {
        ArologisSimpleAccount expenseAccount =
                ArologisSimpleAccount.create("8010", "급여", AccountType.EXPENSE, 60, true);
        when(simpleAccountRepository.findByCodeAndIsDeletedFalse("8010")).thenReturn(Optional.of(expenseAccount));

        assertThatThrownBy(() -> service.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.INCOME, null,
                        new BigDecimal("1000.00"), "8010", null),
                "tester"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);

        verify(cashTxnRepository, never()).save(any());
    }

    @Test
    void create_rejectsNonPositiveAmount() {
        ArologisSimpleAccount account = ArologisSimpleAccount.create("4010", "운송수입", AccountType.INCOME, 40, true);
        when(simpleAccountRepository.findByCodeAndIsDeletedFalse("4010")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.INCOME, null,
                        BigDecimal.ZERO, "4010", null),
                "tester"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void delete_softDeletesTxn() {
        ArologisCashTxn txn = ArologisCashTxn.create(
                LocalDate.of(2026, 6, 8), CashTxnType.EXPENSE, null, new BigDecimal("5000.00"), "8010", null);
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000801");
        when(cashTxnRepository.findById(id)).thenReturn(Optional.of(txn));

        service.delete(id, "tester");

        assertThat(txn.getIsDeleted()).isTrue();
        assertThat(txn.getDeletedBy()).isEqualTo("tester");
    }

    @Test
    void summary_computesIncomeExpenseAndBalanceExactly() {
        when(cashTxnRepository.searchPeriod(
                eq(LocalDate.of(2026, 6, 1)), eq(LocalDate.of(2026, 6, 30)), eq(null)))
                .thenReturn(List.of(
                        ArologisCashTxn.create(LocalDate.of(2026, 6, 2), CashTxnType.INCOME, null,
                                new BigDecimal("100000.50"), "4010", null),
                        ArologisCashTxn.create(LocalDate.of(2026, 6, 3), CashTxnType.INCOME, null,
                                new BigDecimal("50000.25"), "4090", null),
                        ArologisCashTxn.create(LocalDate.of(2026, 6, 4), CashTxnType.EXPENSE, null,
                                new BigDecimal("30000.75"), "8010", null)));

        ArologisAccountingService.CashSummaryView summary = service.summary(
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));

        assertThat(summary.incomeTotal()).isEqualByComparingTo("150000.75");
        assertThat(summary.expenseTotal()).isEqualByComparingTo("30000.75");
        assertThat(summary.balance()).isEqualByComparingTo("120000.00");
        assertThat(summary.count()).isEqualTo(3);
    }

    @Test
    void monthlySummary_resolvesYearMonthToFullMonthRange() {
        when(cashTxnRepository.searchPeriod(
                eq(LocalDate.of(2026, 2, 1)), eq(LocalDate.of(2026, 2, 28)), eq(null)))
                .thenReturn(List.of());

        ArologisAccountingService.CashSummaryView summary = service.monthlySummary(2026, 2);

        assertThat(summary.from()).isEqualTo(LocalDate.of(2026, 2, 1));
        assertThat(summary.to()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(summary.balance()).isEqualByComparingTo("0");
    }

    @Test
    void summary_rejectsInvertedPeriod() {
        assertThatThrownBy(() -> service.summary(LocalDate.of(2026, 6, 30), LocalDate.of(2026, 6, 1)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void listAccounts_returnsActiveAccountsOnly() {
        when(simpleAccountRepository.findAllByIsDeletedFalseAndActiveTrueOrderByDisplayOrderAscCodeAsc())
                .thenReturn(List.of(
                        ArologisSimpleAccount.create("1010", "현금", AccountType.ASSET, 10, true)));

        List<ArologisAccountingService.SimpleAccountView> accounts = service.listAccounts();

        assertThat(accounts).singleElement()
                .satisfies(a -> {
                    assertThat(a.code()).isEqualTo("1010");
                    assertThat(a.type()).isEqualTo(AccountType.ASSET);
                });
    }
}
