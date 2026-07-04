package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * AccountingPeriod 도메인 라이프사이클 단위 테스트 (Phase 10 Step 8 — P2-4).
 *
 * <ol>
 *   <li>create → OPEN 초기 상태</li>
 *   <li>close → CLOSED + 합계 stamp</li>
 *   <li>reverse → OPEN 복귀 (closedAt 보존, reversedAt set)</li>
 *   <li>OPEN 에서 reverse 차단 → CONFLICT</li>
 *   <li>CLOSED 에서 close 재호출 차단 → CONFLICT</li>
 * </ol>
 */
class AccountingPeriodDomainTest {

    private static final LocalDate MAY_FIRST = LocalDate.of(2026, 5, 1);

    @Test
    @DisplayName("create 시 status=OPEN, 합계 0, lockedSlipCount=0")
    void createInitialState() {
        AccountingPeriod p = AccountingPeriod.create(PeriodType.MONTHLY, MAY_FIRST, "5월 마감");

        assertThat(p.getStatus()).isEqualTo(PeriodStatus.OPEN);
        assertThat(p.getTotalSales()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(p.getLockedSlipCount()).isZero();
    }

    @Test
    @DisplayName("close — OPEN → CLOSED + 합계/잠금건수 stamp + closedAt/By")
    void closeTransition() {
        AccountingPeriod p = AccountingPeriod.create(PeriodType.MONTHLY, MAY_FIRST, null);

        p.close("accountant-1", new BigDecimal("1000000"), new BigDecimal("400000"),
                new BigDecimal("100000"), 25);

        assertThat(p.getStatus()).isEqualTo(PeriodStatus.CLOSED);
        assertThat(p.getClosedBy()).isEqualTo("accountant-1");
        assertThat(p.getTotalSales()).isEqualByComparingTo("1000000");
        assertThat(p.getLockedSlipCount()).isEqualTo(25);
    }

    @Test
    @DisplayName("CLOSED 에서 close 재호출 → CONFLICT")
    void closeAlreadyClosed() {
        AccountingPeriod p = AccountingPeriod.create(PeriodType.DAILY, LocalDate.of(2026, 5, 9), null);
        p.close("u", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);

        assertThatThrownBy(() ->
                p.close("u", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("미마감 상태")
                .hasMessageNotContaining("OPEN");
    }

    @Test
    @DisplayName("reverse — CLOSED → OPEN, closedAt 보존 + reversedAt/By stamp")
    void reverseTransition() {
        AccountingPeriod p = AccountingPeriod.create(PeriodType.DAILY, LocalDate.of(2026, 5, 9), null);
        p.close("u", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 5);
        var closedAtBefore = p.getClosedAt();

        p.reverse("master-1");

        assertThat(p.getStatus()).isEqualTo(PeriodStatus.OPEN);
        assertThat(p.getReversedBy()).isEqualTo("master-1");
        assertThat(p.getReversedAt()).isNotNull();
        assertThat(p.getClosedAt()).isEqualTo(closedAtBefore); // audit 보존
    }

    @Test
    @DisplayName("OPEN 에서 reverse 호출 → CONFLICT")
    void reverseRequiresClosed() {
        AccountingPeriod p = AccountingPeriod.create(PeriodType.DAILY, LocalDate.of(2026, 5, 9), null);

        assertThatThrownBy(() -> p.reverse("master-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("마감 상태")
                .hasMessageNotContaining("CLOSED");
    }
}
