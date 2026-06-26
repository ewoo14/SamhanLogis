package com.samhanair.logis.accounting.client;

import com.samhanair.logis.accounting.domain.BankTxnType;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * CODEF 은행·카드 거래내역 단건 레코드.
 *
 * <p>은행 거래와 카드 승인 거래를 {@code BankTransaction} 으로 적재하기 위한 내부 표준 형태다.
 * {@code externalRef} 와 {@code approvalId} 는 CODEF 측 비즈니스 식별자로, 내부 UUID 와 무관하다.
 *
 * @param counterpartyName    입금자명 또는 카드 가맹점명
 * @param txnType             입출금 방향. 카드 승인은 매입/지출이므로 WITHDRAWAL
 * @param amount              거래 금액
 * @param transactionDate     거래 일자
 * @param transactionTime     거래 시각(HHmmss)
 * @param accountOrCardRef    계좌 또는 카드 표시 식별자
 * @param description         적요
 * @param externalRef         CODEF 외부 참조키
 * @param cardName            카드명. 은행 거래는 null
 * @param approvalId          카드 승인번호. 은행 거래는 null
 */
public record CodefTxn(
        String counterpartyName,
        BankTxnType txnType,
        BigDecimal amount,
        LocalDate transactionDate,
        String transactionTime,
        String accountOrCardRef,
        String description,
        String externalRef,
        String cardName,
        String approvalId
) {
}
