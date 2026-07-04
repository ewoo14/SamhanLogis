package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 회계 도메인 상태 enum 사용자 표시명 SSOT 회귀 테스트. */
class AccountingStatusDisplayNameTest {

    @Test
    @DisplayName("상태 enum displayName은 사용자 노출 한국어 라벨을 제공한다")
    void statusDisplayNames() {
        assertThat(JournalStatus.DRAFT.getDisplayName()).isEqualTo("작성중");
        assertThat(JournalStatus.POSTED.getDisplayName()).isEqualTo("확정");
        assertThat(JournalStatus.REVERSED.getDisplayName()).isEqualTo("역분개");

        assertThat(TaxInvoiceStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(TaxInvoiceStatus.ISSUED.getDisplayName()).isEqualTo("발행");
        assertThat(TaxInvoiceStatus.CANCELLED.getDisplayName()).isEqualTo("취소");

        assertThat(CashReceiptStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(CashReceiptStatus.CONFIRMED.getDisplayName()).isEqualTo("확정");
        assertThat(CashReceiptStatus.CANCELLED.getDisplayName()).isEqualTo("취소");

        assertThat(PeriodStatus.OPEN.getDisplayName()).isEqualTo("미마감");
        assertThat(PeriodStatus.CLOSED.getDisplayName()).isEqualTo("마감");

        assertThat(SalesSlipStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(SalesSlipStatus.POSTED.getDisplayName()).isEqualTo("반영완료");
        assertThat(PurchaseSlipStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(PurchaseSlipStatus.POSTED.getDisplayName()).isEqualTo("반영완료");

        assertThat(MatchStatus.UNREFLECTED.getDisplayName()).isEqualTo("미반영");
        assertThat(MatchStatus.REFLECTED.getDisplayName()).isEqualTo("반영");
        assertThat(MatchStatus.FORCED.getDisplayName()).isEqualTo("강제반영");

        assertThat(TaxInvoiceDirection.OUTBOUND.getDisplayName()).isEqualTo("매출(발행)");
        assertThat(TaxInvoiceDirection.INBOUND.getDisplayName()).isEqualTo("매입(수신)");
    }
}
