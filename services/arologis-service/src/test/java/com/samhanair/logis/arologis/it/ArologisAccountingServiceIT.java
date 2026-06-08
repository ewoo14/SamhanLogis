package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.CashTxnType;
import com.samhanair.logis.arologis.service.ArologisAccountingService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * 아로로지스 간이 회계 서비스 IT.
 *
 * <p>Flyway V15 schema/계정과목 seed 와 실제 JPA repository 를 사용한다. 외부 client 는
 * {@code @MockBean} 으로 격리한다. 거래 데이터는 가짜로 seed 하지 않고 API(서비스) 로만 생성한다.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@Transactional
class ArologisAccountingServiceIT extends AbstractPostgresIT {

    @Autowired private ArologisAccountingService accountingService;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    void seededAccountsAreAvailable() {
        List<ArologisAccountingService.SimpleAccountView> accounts = accountingService.listAccounts();

        assertThat(accounts).extracting(ArologisAccountingService.SimpleAccountView::code)
                .contains("1010", "4010", "8010");
    }

    @Test
    void createIncomeAndExpense_thenSummaryComputesBalance() {
        accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 5), CashTxnType.INCOME, "한진택배",
                        new BigDecimal("200000.00"), "4010", "운송료"),
                "it-tester");
        accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 10), CashTxnType.INCOME, null,
                        new BigDecimal("50000.50"), "4090", "기타"),
                "it-tester");
        accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 15), CashTxnType.EXPENSE, "주유소",
                        new BigDecimal("80000.50"), "8050", "차량유지"),
                "it-tester");

        List<ArologisAccountingService.CashTxnView> list =
                accountingService.list(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30), null);
        assertThat(list).hasSize(3);

        List<ArologisAccountingService.CashTxnView> incomeOnly =
                accountingService.list(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30), CashTxnType.INCOME);
        assertThat(incomeOnly).hasSize(2);

        ArologisAccountingService.CashSummaryView summary = accountingService.monthlySummary(2026, 6);
        assertThat(summary.incomeTotal()).isEqualByComparingTo("250000.50");
        assertThat(summary.expenseTotal()).isEqualByComparingTo("80000.50");
        assertThat(summary.balance()).isEqualByComparingTo("170000.00");
        assertThat(summary.count()).isEqualTo(3);
    }

    @Test
    void deleteTxn_isExcludedFromListAndSummary() {
        ArologisAccountingService.CashTxnView created = accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 7, 1), CashTxnType.EXPENSE, null,
                        new BigDecimal("12345.67"), "8090", "잡비"),
                "it-tester");

        accountingService.delete(created.id(), "it-tester");

        assertThat(accountingService.list(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), null)).isEmpty();
        assertThat(accountingService.monthlySummary(2026, 7).expenseTotal()).isEqualByComparingTo("0");
        assertThatThrownBy(() -> accountingService.get(created.id()))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void create_rejectsUnknownAccountCode() {
        assertThatThrownBy(() -> accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.EXPENSE, null,
                        new BigDecimal("1000.00"), "0000", null),
                "it-tester"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void create_rejectsExpenseTxnWithIncomeAccount() {
        assertThatThrownBy(() -> accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.EXPENSE, null,
                        new BigDecimal("1000.00"), "4010", null),
                "it-tester"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void update_changesTxnFields() {
        ArologisAccountingService.CashTxnView created = accountingService.create(
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 8), CashTxnType.EXPENSE, "공급처A",
                        new BigDecimal("10000.00"), "8040", "통신비"),
                "it-tester");

        ArologisAccountingService.CashTxnView updated = accountingService.update(
                created.id(),
                new ArologisAccountingService.CreateCashTxnCommand(
                        LocalDate.of(2026, 6, 9), CashTxnType.EXPENSE, "공급처B",
                        new BigDecimal("20000.00"), "8060", "지급수수료"),
                "it-tester");

        assertThat(updated.amount()).isEqualByComparingTo("20000.00");
        assertThat(updated.accountCode()).isEqualTo("8060");
        assertThat(updated.partnerName()).isEqualTo("공급처B");
        assertThat(updated.txnDate()).isEqualTo(LocalDate.of(2026, 6, 9));
    }
}
