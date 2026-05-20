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
 * Journal 도메인 라이프사이클 + 도메인 가드 단위 테스트 (Plan §2 라이프사이클 표).
 *
 * <p>5+ 시나리오:
 * <ol>
 *   <li>create → DRAFT 초기 상태</li>
 *   <li>post 정상 (차/대 합계 일치)</li>
 *   <li>post 실패 — 합계 mismatch → CONFLICT</li>
 *   <li>post 실패 — 라인 없음 → CONFLICT</li>
 *   <li>POSTED 후 라인 추가/제거 차단 → CONFLICT</li>
 *   <li>DRAFT 에서 markReversed 차단 → CONFLICT</li>
 *   <li>POSTED 에서 markReversed → REVERSED 정상</li>
 *   <li>JournalLine debit/credit 동시 0 거부</li>
 *   <li>JournalLine debit/credit 동시 양수 거부</li>
 * </ol>
 */
class JournalDomainTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 4);

    @Test
    @DisplayName("create 시 status=DRAFT, postedAt/By null")
    void createInitialState() {
        Journal j = Journal.create("20260504-1", TODAY, "테스트", JournalSourceType.MANUAL, (java.util.UUID) null);

        assertThat(j.getStatus()).isEqualTo(JournalStatus.DRAFT);
        assertThat(j.getPostedAt()).isNull();
        assertThat(j.getPostedBy()).isNull();
        assertThat(j.getLines()).isEmpty();
        assertThat(j.totalDebit()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("post 정상 — 차/대 합계 일치 시 POSTED 전이 + postedAt/By 기입")
    void postSuccess() {
        Journal j = newJournal();
        addBalancedLines(j, "100000");

        j.post("user-A");

        assertThat(j.getStatus()).isEqualTo(JournalStatus.POSTED);
        assertThat(j.getPostedBy()).isEqualTo("user-A");
        assertThat(j.getPostedAt()).isNotNull();
    }

    @Test
    @DisplayName("post 실패 — 차변/대변 합계 mismatch 시 CONFLICT")
    void postMismatchConflict() {
        Journal j = newJournal();
        j.addLine(JournalLine.create(j, 1, "101", new BigDecimal("100000"), BigDecimal.ZERO, null, null));
        j.addLine(JournalLine.create(j, 2, "401", BigDecimal.ZERO, new BigDecimal("90000"), null, null));

        assertThatThrownBy(() -> j.post("user-A"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        assertThat(j.getStatus()).isEqualTo(JournalStatus.DRAFT);
    }

    @Test
    @DisplayName("post 실패 — 라인 0건 시 CONFLICT")
    void postNoLinesConflict() {
        Journal j = newJournal();

        assertThatThrownBy(() -> j.post("user-A"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라인이 1개 이상");
    }

    @Test
    @DisplayName("POSTED 후 addLine/removeLine 차단 — CONFLICT")
    void postedBlocksMutation() {
        Journal j = newJournal();
        addBalancedLines(j, "50000");
        j.post("user-A");

        JournalLine extra = JournalLine.create(j, 99, "101", new BigDecimal("1"), BigDecimal.ZERO, null, null);
        assertThatThrownBy(() -> j.addLine(extra))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("DRAFT");

        UUID firstId = j.getLines().get(0).getId();
        assertThatThrownBy(() -> j.removeLine(firstId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("DRAFT 에서 markReversed 차단 — CONFLICT (POSTED 만 허용)")
    void markReversedRequiresPosted() {
        Journal j = newJournal();

        assertThatThrownBy(j::markReversed)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("POSTED");
    }

    @Test
    @DisplayName("POSTED → markReversed → REVERSED, linkReversal 로 신규 분개 ID 연결")
    void markReversedAndLink() {
        Journal j = newJournal();
        addBalancedLines(j, "70000");
        j.post("user-A");

        j.markReversed();
        UUID newJournalId = UUID.randomUUID();
        j.linkReversal(newJournalId);

        assertThat(j.getStatus()).isEqualTo(JournalStatus.REVERSED);
        assertThat(j.getReversedJournalId()).isEqualTo(newJournalId);
    }

    @Test
    @DisplayName("JournalLine — debit/credit 동시 0 거부")
    void lineRejectsBothZero() {
        Journal j = newJournal();
        assertThatThrownBy(() ->
                JournalLine.create(j, 1, "101", BigDecimal.ZERO, BigDecimal.ZERO, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("동시 0");
    }

    @Test
    @DisplayName("JournalLine — debit/credit 동시 양수 거부")
    void lineRejectsBothPositive() {
        Journal j = newJournal();
        assertThatThrownBy(() ->
                JournalLine.create(j, 1, "101", new BigDecimal("100"), new BigDecimal("100"), null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("둘 다 양수");
    }

    private Journal newJournal() {
        return Journal.create("20260504-1", TODAY, "테스트", JournalSourceType.MANUAL, (java.util.UUID) null);
    }

    private void addBalancedLines(Journal j, String amount) {
        BigDecimal amt = new BigDecimal(amount);
        j.addLine(JournalLine.create(j, 1, "101", amt, BigDecimal.ZERO, null, "현금"));
        j.addLine(JournalLine.create(j, 2, "401", BigDecimal.ZERO, amt, null, "상품매출"));
    }
}
