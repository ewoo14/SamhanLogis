package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * #1144 공통 연결 read model의 핵심 불변식 RED 테스트.
 *
 * <p>이 테스트는 구현 전 현재 초안이 legacy와 UUID-only를 별도 상태로 설명하지 못함을
 * 재현한다. 생산 코드가 이 테스트를 통과시키기 전에는 계약을 완성으로 취급하지 않는다.
 */
class AccountingSlipLinkEligibilityRedTest {

    @Test
    void legacy_미연결_전표는_생성가능이_아닌_읽기전용으로_구분된다() {
        AccountingSlipLinkReadModel legacy = new AccountingSlipLinkReadModel(
                "OUT-LEGACY-001", "OUTBOUND", "LEGACY_READ_ONLY", "P-001",
                BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.ZERO,
                List.of(), false);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                legacy, true, "MANAGER");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasons()).extracting(Enum::name)
                .contains("LEGACY_READ_ONLY");
    }

    @Test
    void UUID_only_원천행은_조용히_누락되지_않고_데이터무결성_차단으로_구분된다() {
        AccountingSlipLinkReadModel uuidOnly = new AccountingSlipLinkReadModel(
                "IN-UUID-ONLY-001", "INBOUND", "CONFIRMED", "",
                BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.ZERO,
                List.of(), false);

        AccountingSlipEligibility result = AccountingSlipEligibility.evaluate(
                uuidOnly, true, "ACCOUNTANT");

        assertThat(result.allowed()).isFalse();
        assertThat(result.reasonMessages()).anyMatch(message ->
                message.contains("데이터") || message.contains("무결성"));
    }
}
