package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.client.CodefTxn;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CodefImportServiceTest {

    @Mock private CodefClient codefClient;
    @Mock private BankTransactionRepository bankTransactionRepository;
    @Mock private DepositMatchService depositMatchService;

    @InjectMocks private CodefImportService service;

    @Test
    @DisplayName("거래시각 형식 오류 메시지는 내부 공급자명을 노출하지 않는다")
    void importTransactionsForRefsWithInvalidTime_hidesProviderNameInMessage() {
        LocalDate date = LocalDate.of(2026, 6, 1);
        when(codefClient.fetchBankTransactions(date, date, "국민 123-456", "DRY_RUN"))
                .thenReturn(List.of(new CodefTxn(
                        "거래처",
                        BankTxnType.DEPOSIT,
                        new BigDecimal("1000.00"),
                        date,
                        "250000",
                        "국민 123-456",
                        "메모",
                        "EXT-1",
                        null,
                        null)));

        assertThatThrownBy(() -> service.importTransactionsForRefs(
                date,
                date,
                CodefImportType.BANK,
                List.of("국민 123-456"),
                List.of(),
                List.of(),
                "DRY_RUN"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(be.getMessage()).isEqualTo("거래시각 형식이 올바르지 않습니다: 250000");
                });
    }

    @Test
    @DisplayName("전체 가져오기 식별값 누락 메시지는 영어 필드명을 노출하지 않는다")
    void importTransactionsWithAllAndNoRefs_usesKoreanDomainTerms() {
        LocalDate date = LocalDate.of(2026, 6, 1);

        assertThatThrownBy(() -> service.importTransactions(
                date,
                date,
                CodefImportType.ALL,
                null,
                null,
                null,
                "DRY_RUN"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(be.getMessage()).isEqualTo("계좌·카드·대출 식별값 중 하나는 필수입니다.");
                });
    }
}
