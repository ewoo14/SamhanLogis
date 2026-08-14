package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class AccountingSlipLinkEligibilityTest {

    @Test
    void 일마감_금액이_미검증이면_회계전표_생성을_차단하고_사유를_반환한다() {
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "OUT-20260814-001", "OUTBOUND", BigDecimal.valueOf(110), BigDecimal.ZERO,
                BigDecimal.ZERO, List.of(), false);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                readModel, false, "ACCOUNTANT");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasons()).contains(AccountingSlipEligibility.Reason.DAILY_AMOUNT_UNVERIFIED);
        assertThat(result.reasonMessages()).contains("일마감 금액 검증이 완료되지 않았습니다");
    }

    @Test
    void 실제_일마감_금액이_있고_검증하지_않으면_Q5_게이트가_차단한다() {
        AccountingSlipEligibility result = AccountingSlipEligibility.evaluateDailyClosing(
                BigDecimal.valueOf(110000), false, "ACCOUNTANT");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasons())
                .containsExactly(AccountingSlipEligibility.Reason.DAILY_AMOUNT_UNVERIFIED);
        assertThat(result.reasonMessages())
                .containsExactly("일마감 금액 검증이 완료되지 않았습니다");
    }

    @Test
    void 금액이_맞지_않으면_회계전표_생성을_차단한다() {
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "IN-20260814-001", "INBOUND", BigDecimal.valueOf(100), BigDecimal.valueOf(90),
                BigDecimal.ONE, List.of(new AccountingSlipLinkReadModel.LinkedSlip("AS-002", "DRAFT", BigDecimal.valueOf(90))), false);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                readModel, true, "MASTER");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasons()).contains(AccountingSlipEligibility.Reason.AMOUNT_MISMATCH);
    }

    @Test
    void 회계담당자_관리자_마스터만_생성할_수_있다() {
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "OUT-20260814-002", "OUTBOUND", BigDecimal.valueOf(100), BigDecimal.ZERO,
                BigDecimal.ZERO, List.of(), true);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                readModel, true, "SALES");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasons()).contains(AccountingSlipEligibility.Reason.PERMISSION_DENIED);
    }

    @Test
    void 확정되고_미연결인_전표는_검증된_금액과_허용된_역할이면_생성_가능하다() {
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "OUT-20260814-004", "OUTBOUND", BigDecimal.valueOf(100), BigDecimal.ZERO,
                BigDecimal.ZERO, List.of(), false);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                readModel, true, "MANAGER");

        assertThat(result.allowed()).isTrue();
        assertThat(result.reasons()).isEmpty();
    }

    @Test
    void read_model은_사용자에게_UUID를_노출하지_않고_연결_전표번호와_금액을_제공한다() {
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "OUT-20260814-003", "OUTBOUND", BigDecimal.valueOf(100), BigDecimal.valueOf(100),
                BigDecimal.ONE, List.of(new AccountingSlipLinkReadModel.LinkedSlip("AS-001", "DRAFT", BigDecimal.valueOf(100))), true);

        assertThat(readModel.sourceSlipNo()).isEqualTo("OUT-20260814-003");
        assertThat(readModel.linkedSlips()).extracting(AccountingSlipLinkReadModel.LinkedSlip::slipNo)
                .containsExactly("AS-001");
        assertThat(readModel.toString()).doesNotContain("UUID");
    }
}
