package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * TaxInvoice 도메인 라이프사이클 + 가드 단위 테스트 (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>4 시나리오 (작업 범위 의무):
 *
 * <ol>
 *   <li>발행: DRAFT → ISSUED + 자동 합계 / 발행번호 set</li>
 *   <li>취소: ISSUED → CANCELLED</li>
 *   <li>cancel 역분개 가능성 (linkReverseJournal 호출)</li>
 *   <li>VAT 자동 계산 정확성 (라인 합계 → 헤더 vat = supply * 0.1)</li>
 * </ol>
 */
class TaxInvoiceDomainTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 4);

    @Test
    @DisplayName("create 시 status=DRAFT, 합계 0, taxInvoiceNo null")
    void createInitialState() {
        TaxInvoice ti = newDraft();

        assertThat(ti.getStatus()).isEqualTo(TaxInvoiceStatus.DRAFT);
        assertThat(ti.getDirection()).isEqualTo(TaxInvoiceDirection.OUTBOUND);
        assertThat(ti.getTaxInvoiceNo()).isNull();
        assertThat(ti.getSupplyAmount()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(ti.getVatAmount()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("issue — DRAFT → ISSUED, 발행번호 set, 자동 합계 (supply 100k → vat 10k → total 110k)")
    void issueSuccess() {
        TaxInvoice ti = newDraft();
        ti.addLine(TaxInvoiceLine.create(ti, 1, "운임 기본료", "kg",
                new BigDecimal("100"), new BigDecimal("1000"), null));

        ti.issue("2026/05/04-1", "user-A");

        assertThat(ti.getStatus()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(ti.getTaxInvoiceNo()).isEqualTo("2026/05/04-1");
        assertThat(ti.getIssuedBy()).isEqualTo("user-A");
        assertThat(ti.getSupplyAmount()).isEqualByComparingTo("100000.00");
        assertThat(ti.getVatAmount()).isEqualByComparingTo("10000.00");
        assertThat(ti.getTotalAmount()).isEqualByComparingTo("110000.00");
    }

    @Test
    @DisplayName("issue 실패 — 라인 0건 시 CONFLICT")
    void issueRequiresLines() {
        TaxInvoice ti = newDraft();
        assertThatThrownBy(() -> ti.issue("2026/05/04-1", "user-A"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라인이 1개 이상");
    }

    @Test
    @DisplayName("markReceived — INBOUND DRAFT만 ISSUED 전이하고 OUTBOUND 자동분개는 만들지 않음")
    void markReceivedSuccess() {
        TaxInvoice ti = TaxInvoice.createInbound("2026/05/04-9001", TODAY,
                UUID.randomUUID(), "P-001", "테스트거래처", "123-45-67890",
                new BigDecimal("100000.00"), new BigDecimal("10000.00"),
                new BigDecimal("110000.00"), "source-user");

        ti.markReceived("receiver-A");

        assertThat(ti.getStatus()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(ti.getIssuedBy()).isEqualTo("receiver-A");
        assertThat(ti.getJournalId()).isNull();
    }

    @Test
    @DisplayName("markReceived 실패 — OUTBOUND 세금계산서 차단")
    void markReceivedBlocksOutbound() {
        TaxInvoice ti = newDraft();

        assertThatThrownBy(() -> ti.markReceived("receiver-A"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("매입(수신)")
                .hasMessageNotContaining("INBOUND");
    }

    @Test
    @DisplayName("ISSUED 후 addLine 차단 — CONFLICT")
    void issuedBlocksMutation() {
        TaxInvoice ti = newDraft();
        ti.addLine(TaxInvoiceLine.create(ti, 1, "x", null,
                new BigDecimal("1"), new BigDecimal("1000"), null));
        ti.issue("2026/05/04-1", "user-A");

        TaxInvoiceLine extra = TaxInvoiceLine.create(ti, 2, "y", null,
                new BigDecimal("1"), new BigDecimal("100"), null);
        assertThatThrownBy(() -> ti.addLine(extra))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    @DisplayName("cancel — ISSUED → CANCELLED + cancelledAt/By 기록 + linkReverseJournal 가능")
    @SuppressWarnings("deprecation")
    void cancelTransition() {
        TaxInvoice ti = newDraft();
        ti.addLine(TaxInvoiceLine.create(ti, 1, "운임", null,
                new BigDecimal("1"), new BigDecimal("50000"), null));
        ti.issue("2026/05/04-1", "user-A");

        ti.cancel("user-B");
        UUID reverseId = UUID.randomUUID();
        ti.linkReverseJournal(reverseId);

        assertThat(ti.getStatus()).isEqualTo(TaxInvoiceStatus.CANCELLED);
        assertThat(ti.getCancelledBy()).isEqualTo("user-B");
        assertThat(ti.getReverseJournalId()).isEqualTo(reverseId);
    }

    @Test
    @DisplayName("cancel — DRAFT 상태에서 호출 시 CONFLICT")
    @SuppressWarnings("deprecation")
    void cancelRequiresIssued() {
        TaxInvoice ti = newDraft();
        assertThatThrownBy(() -> ti.cancel("user-B"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("발행")
                .hasMessageNotContaining("ISSUED");
    }

    @Test
    @DisplayName("updateBasic — DRAFT 에서 partnerId+partnerCode 교체 반영 (#825 CH1/CM-a), null partnerId 거부")
    void updateBasicReflectsPartnerId() {
        TaxInvoice ti = newDraft();
        UUID newPartnerId = UUID.randomUUID();

        ti.updateBasic(newPartnerId, "9876543210", "987-65-43210", "교체거래처", "부산시 해운대구",
                TODAY.plusDays(1), "거래처 교체");

        assertThat(ti.getPartnerId()).isEqualTo(newPartnerId);
        assertThat(ti.getPartnerCode()).isEqualTo("9876543210");
        assertThat(ti.getPartnerName()).isEqualTo("교체거래처");
        assertThat(ti.getPartnerBusinessNo()).isEqualTo("987-65-43210");
        assertThat(ti.getStatus()).isEqualTo(TaxInvoiceStatus.DRAFT);

        assertThatThrownBy(() -> ti.updateBasic(null, "9876543210", "987-65-43210", "교체거래처",
                null, TODAY, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("partnerId");

        // #825 CM-a — partnerCode 50자 초과 도메인 가드 (DTO @Size 와 이중 방어)
        assertThatThrownBy(() -> ti.updateBasic(newPartnerId, "X".repeat(51), "987-65-43210",
                "교체거래처", null, TODAY, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("partnerCode");
    }

    @Test
    @DisplayName("VAT 자동 — 라인 supply 50000 → vat 5000 (HALF_UP)")
    void vatAutoCalc() {
        TaxInvoiceLine line = TaxInvoiceLine.create(
                newDraft(), 1, "x", null,
                new BigDecimal("50"), new BigDecimal("1000"), null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("50000.00");
        assertThat(line.getVatAmount()).isEqualByComparingTo("5000.00");
    }

    private TaxInvoice newDraft() {
        return TaxInvoice.create(UUID.randomUUID(), "123-45-67890",
                "테스트거래처", "서울시 강남구", TODAY, "테스트 세금계산서");
    }
}
