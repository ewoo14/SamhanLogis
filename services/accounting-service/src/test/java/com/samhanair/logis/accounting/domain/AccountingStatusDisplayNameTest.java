package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 회계 도메인 상태 enum 사용자 표시명 SSOT 회귀 테스트. */
class AccountingStatusDisplayNameTest {

    @Test
    @DisplayName("상태 enum displayName은 사용자 노출 한국어 라벨을 제공한다")
    void statusDisplayNames() {
        assertThat(JournalStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(JournalStatus.POSTED.getDisplayName()).isEqualTo("확정");
        assertThat(JournalStatus.REVERSED.getDisplayName()).isEqualTo("역분개");

        assertThat(TaxInvoiceStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(TaxInvoiceStatus.ISSUED.getDisplayName()).isEqualTo("발행");
        assertThat(TaxInvoiceStatus.CANCELLED.getDisplayName()).isEqualTo("취소");

        assertThat(CashReceiptStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(CashReceiptStatus.CONFIRMED.getDisplayName()).isEqualTo("확정");
        assertThat(CashReceiptStatus.CANCELLED.getDisplayName()).isEqualTo("취소");

        assertThat(PeriodStatus.OPEN.getDisplayName()).isEqualTo("열림");
        assertThat(PeriodStatus.CLOSED.getDisplayName()).isEqualTo("마감");

        assertThat(SalesSlipStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(SalesSlipStatus.POSTED.getDisplayName()).isEqualTo("반영완료");
        assertThat(PurchaseSlipStatus.DRAFT.getDisplayName()).isEqualTo("임시저장");
        assertThat(PurchaseSlipStatus.POSTED.getDisplayName()).isEqualTo("반영완료");

        assertThat(MatchStatus.UNREFLECTED.getDisplayName()).isEqualTo("미반영");
        assertThat(MatchStatus.REFLECTED.getDisplayName()).isEqualTo("반영");
        assertThat(MatchStatus.FORCED.getDisplayName()).isEqualTo("강제");

        assertThat(TaxInvoiceDirection.OUTBOUND.getDisplayName()).isEqualTo("매출(발행)");
        assertThat(TaxInvoiceDirection.INBOUND.getDisplayName()).isEqualTo("매입(수신)");
        assertThat(TaxInvoiceType.SALES.getDisplayName()).isEqualTo("매출");
        assertThat(TaxInvoiceType.PURCHASE.getDisplayName()).isEqualTo("매입");

        assertThat(PlanStatus.PLANNED.getDisplayName()).isEqualTo("예정");
        assertThat(PlanStatus.COLLECTED.getDisplayName()).isEqualTo("수금완료");
        assertThat(PlanStatus.OVERDUE.getDisplayName()).isEqualTo("연체");

        assertThat(NoteStatus.BOARDING.getDisplayName()).isEqualTo("보유");
        assertThat(NoteStatus.COLLECTING.getDisplayName()).isEqualTo("추심");
        assertThat(NoteStatus.SETTLED.getDisplayName()).isEqualTo("결제완료");
        assertThat(NoteStatus.DISHONORED.getDisplayName()).isEqualTo("부도");
    }

    @Test
    @DisplayName("사용자 노출 회계 오류 기본 메시지는 상태 enum 원문을 포함하지 않는다")
    void accountingErrorCodeDefaultMessagesDoNotExposeRawStatusCodes() {
        assertThat(ErrorCode.TAX_INVOICE_NOT_EMITTABLE.getDefaultMessage())
                .contains("발행")
                .doesNotContain("ISSUED");
        assertThat(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED.getDefaultMessage())
                .contains("확정")
                .doesNotContain("CONFIRMED");
        assertThat(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH.getDefaultMessage())
                .contains("출고", "입고")
                .doesNotContain("OUTBOUND", "INBOUND", "source");
        assertThat(ErrorCode.SAS_OVER_ALLOCATION.getDefaultMessage())
                .contains("라인")
                .doesNotContain("line");
        assertThat(ErrorCode.SAS_LINE_AMOUNT_MISMATCH.getDefaultMessage())
                .contains("라인")
                .doesNotContain("line_total");
        assertThat(ErrorCode.SAS_TAX_TYPE_MIXED.getDefaultMessage())
                .contains("라인")
                .doesNotContain("tax_type");
        assertThat(ErrorCode.SAS_ALREADY_POSTED.getDefaultMessage())
                .contains("반영완료")
                .doesNotContain("POSTED");
        assertThat(ErrorCode.SAS_SALES_SLIP_NOT_POSTED.getDefaultMessage())
                .contains("반영완료")
                .doesNotContain("POSTED");
        assertThat(ErrorCode.SAS_PURCHASE_SLIP_NOT_POSTED.getDefaultMessage())
                .contains("반영완료")
                .doesNotContain("POSTED");
        assertThat(ErrorCode.MIG3_JOURNAL_BALANCE_MISMATCH.getDefaultMessage())
                .contains("확정")
                .doesNotContain("POSTED");
    }
}
