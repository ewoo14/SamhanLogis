package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.web.dto.BankDepositReceiptRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionNaturalKeyRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** BankDepositReceiptService 검증 분기 단위 테스트. */
@ExtendWith(MockitoExtension.class)
class BankDepositReceiptServiceTest {

    private static final UUID PARTNER_ID = UUID.fromString("40000000-0000-0000-0000-000000000001");
    private static final UUID PARTNER_2_ID = UUID.fromString("40000000-0000-0000-0000-000000000002");

    @Mock private BankTransactionService bankTransactionService;
    @Mock private CashReceiptService cashReceiptService;
    @Mock private NamedParameterJdbcTemplate namedParameterJdbcTemplate;
    @Mock private EntityManager entityManager;

    @InjectMocks private BankDepositReceiptService service;

    @Test
    @DisplayName("거래처가 서로 다른 통장거래 묶음은 409로 차단하고 입금보고서를 만들지 않는다")
    void rejectPartnerMismatch() {
        when(bankTransactionService.findUniqueByNaturalKey(anyString(), any(), any(), anyString()))
                .thenReturn(matchedDeposit("A", PARTNER_ID), matchedDeposit("B", PARTNER_2_ID));

        // 자매 검증 분기와 동일하게 externalRef 를 메시지에 포함한다(불일치를 유발한 거래 B 식별).
        assertConflict(request(key("A"), key("B")), "동일 거래처로 매칭되어야 합니다: B");
        verifyNoInteractions(cashReceiptService);
    }

    @Test
    @DisplayName("거래처 미매칭 통장거래는 409로 차단한다")
    void rejectUnmatchedPartner() {
        when(bankTransactionService.findUniqueByNaturalKey(anyString(), any(), any(), anyString()))
                .thenReturn(deposit("A", BankTxnSource.CSV_IMPORT, "1000.00", BankTxnType.DEPOSIT));

        assertConflict(request(key("A")), "거래처 매칭");
        verifyNoInteractions(cashReceiptService);
    }

    @Test
    @DisplayName("이미 REFLECTED 인 통장거래는 409로 차단한다")
    void rejectAlreadyReflected() {
        BankTransaction reflected = matchedDeposit("A", PARTNER_ID);
        reflected.markReflected(UUID.randomUUID());
        when(bankTransactionService.findUniqueByNaturalKey(anyString(), any(), any(), anyString()))
                .thenReturn(reflected);

        assertConflict(request(key("A")), "미반영");
        verifyNoInteractions(cashReceiptService);
    }

    @Test
    @DisplayName("CODEF_LOAN source 는 입금보고서 반영 대상에서 제외한다")
    void rejectCodefLoan() {
        when(bankTransactionService.findUniqueByNaturalKey(anyString(), any(), any(), anyString()))
                .thenReturn(matched("A", PARTNER_ID, BankTxnSource.CODEF_LOAN, BankTxnType.DEPOSIT));

        assertConflict(request(key("A")), "CODEF_LOAN");
        verifyNoInteractions(cashReceiptService);
    }

    @Test
    @DisplayName("출금 거래는 입금보고서 반영 대상에서 제외한다")
    void rejectWithdrawal() {
        when(bankTransactionService.findUniqueByNaturalKey(anyString(), any(), any(), anyString()))
                .thenReturn(matched("A", PARTNER_ID, BankTxnSource.CSV_IMPORT, BankTxnType.WITHDRAWAL));

        assertConflict(request(key("A")), "입금");
        verifyNoInteractions(cashReceiptService);
    }

    private void assertConflict(BankDepositReceiptRequest request, String messagePart) {
        assertThatThrownBy(() -> service.createFromBankTransactions(request, "actor"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException business = (BusinessException) ex;
                    assertThat(business.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(business.getMessage()).contains(messagePart);
                });
    }

    private static BankDepositReceiptRequest request(BankTransactionNaturalKeyRequest... keys) {
        return new BankDepositReceiptRequest(
                List.of(keys),
                LocalDate.of(2026, 7, 4),
                "단위 테스트",
                null,
                null);
    }

    private static BankTransactionNaturalKeyRequest key(String externalRef) {
        return new BankTransactionNaturalKeyRequest(
                "테스트계좌",
                LocalDateTime.of(2026, 7, 4, 9, 0),
                new BigDecimal("1000.00"),
                externalRef);
    }

    private static BankTransaction matchedDeposit(String externalRef, UUID partnerId) {
        return matched(externalRef, partnerId, BankTxnSource.CSV_IMPORT, BankTxnType.DEPOSIT);
    }

    private static BankTransaction matched(String externalRef, UUID partnerId,
                                           BankTxnSource source, BankTxnType type) {
        BankTransaction transaction = deposit(externalRef, source, "1000.00", type);
        transaction.matchPartner(partnerId);
        return transaction;
    }

    private static BankTransaction deposit(String externalRef, BankTxnSource source,
                                           String amount, BankTxnType type) {
        return BankTransaction.importRow(
                LocalDateTime.of(2026, 7, 4, 9, 0),
                type,
                new BigDecimal(amount),
                null,
                "단위 테스트",
                "거래처",
                null,
                "테스트계좌",
                source,
                externalRef);
    }
}
