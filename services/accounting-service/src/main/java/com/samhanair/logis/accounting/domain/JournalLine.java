package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 분개 라인 — 차변/대변 1쌍의 한 항. accountCode 는 ChartOfAccount FK (logical, leaf 만 허용).
 *
 * <p>차변/대변 동시 0 금지 (도메인 가드 + DB CHECK). 한 라인은 차변 또는 대변 한 쪽만 양수,
 * 다른 쪽은 0. partnerId 는 거래처 추적용 (A4 receivables/payables 집계 시 활용).
 */
@Entity
@Getter
@Table(name = "journal_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class JournalLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_id", nullable = false)
    private Journal journal;

    /** 라인 표시 순번 (1, 2, 3, ...). 화면 표시 정렬. */
    @Column(name = "line_no", nullable = false)
    private int lineNo;

    /** 계정 코드 (ChartOfAccount.code 참조 — leaf 만 허용, 검증은 service 레이어). */
    @Column(name = "account_code", nullable = false, length = 6)
    private String accountCode;

    /** 차변 금액 — 0 또는 양수, NUMERIC(15,2). */
    @Column(name = "debit_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal debitAmount;

    /** 대변 금액 — 0 또는 양수, NUMERIC(15,2). */
    @Column(name = "credit_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal creditAmount;

    /** 거래처 UUID (선택, A4 receivables/payables 집계 시 활용). */
    @Column(name = "partner_id")
    private UUID partnerId;

    /** 거래처명 스냅샷 (선택, 수기 full-form 편집 입력값 보존). */
    @Column(name = "partner_name", length = 200)
    private String partnerName;

    /** 라인 메모 (최대 500자). */
    @Column(name = "memo", length = 500)
    private String memo;

    private JournalLine(Journal journal, int lineNo, String accountCode,
                        BigDecimal debitAmount, BigDecimal creditAmount,
                        UUID partnerId, String partnerName, String memo) {
        validateAmounts(debitAmount, creditAmount);
        this.journal = journal;
        this.lineNo = lineNo;
        this.accountCode = accountCode;
        this.debitAmount = debitAmount;
        this.creditAmount = creditAmount;
        this.partnerId = partnerId;
        this.partnerName = partnerName;
        this.memo = memo;
    }

    /**
     * 분개 라인 1건 생성. 차변/대변 한 쪽만 양수, 다른 쪽 0 강제. 둘 다 0 또는 둘 다 양수면 거부.
     *
     * @param journal 부모 Journal (cascade 영속화)
     * @param lineNo 표시 순번 (1 이상)
     * @param accountCode 계정 코드 (ChartOfAccount leaf, service 사전 검증)
     * @param debitAmount 차변 금액 (≥0)
     * @param creditAmount 대변 금액 (≥0)
     * @param partnerId 거래처 UUID (선택)
     * @param memo 라인 메모 (선택, ≤500자)
     * @return 영속화 전 JournalLine
     * @throws IllegalArgumentException debit/credit 동시 0 또는 동시 양수, 음수, accountCode null
     */
    public static JournalLine create(Journal journal, int lineNo, String accountCode,
                                     BigDecimal debitAmount, BigDecimal creditAmount,
                                     UUID partnerId, String memo) {
        return create(journal, lineNo, accountCode, debitAmount, creditAmount, partnerId, null, memo);
    }

    /**
     * 분개 라인 1건 생성. 수기 편집 화면의 거래처명 스냅샷을 함께 보존한다.
     *
     * @param journal 부모 Journal (cascade 영속화)
     * @param lineNo 표시 순번 (1 이상)
     * @param accountCode 계정 코드 (ChartOfAccount leaf, service 사전 검증)
     * @param debitAmount 차변 금액 (≥0)
     * @param creditAmount 대변 금액 (≥0)
     * @param partnerId 거래처 UUID (선택)
     * @param partnerName 거래처명 스냅샷 (선택, ≤200자)
     * @param memo 라인 메모 (선택, ≤500자)
     * @return 영속화 전 JournalLine
     * @throws IllegalArgumentException debit/credit 동시 0 또는 동시 양수, 음수, accountCode null
     */
    public static JournalLine create(Journal journal, int lineNo, String accountCode,
                                     BigDecimal debitAmount, BigDecimal creditAmount,
                                     UUID partnerId, String partnerName, String memo) {
        if (accountCode == null || accountCode.isBlank()) {
            throw new IllegalArgumentException("accountCode 는 필수입니다");
        }
        if (partnerName != null && partnerName.length() > 200) {
            throw new IllegalArgumentException("partnerName 은 최대 200자입니다");
        }
        if (memo != null && memo.length() > 500) {
            throw new IllegalArgumentException("memo 는 최대 500자입니다");
        }
        return new JournalLine(journal, lineNo, accountCode,
                debitAmount == null ? BigDecimal.ZERO : debitAmount,
                creditAmount == null ? BigDecimal.ZERO : creditAmount,
                partnerId, partnerName, memo);
    }

    /**
     * 협업 수정완료 overlay 라인메모 변경.
     *
     * <p>차대변 금액·계정코드·거래처 등 원장 필드는 불변으로 두고, 설명성 보조 필드인 memo 만
     * 갱신한다.
     *
     * @param memo 신규 라인 메모. null 허용, 500자 이하.
     * @return 현재 JournalLine (도메인 메서드 체인용)
     */
    public JournalLine updateMemo(String memo) {
        if (memo != null && memo.length() > 500) {
            throw new IllegalArgumentException("memo 는 최대 500자입니다");
        }
        this.memo = memo;
        return this;
    }

    private static void validateAmounts(BigDecimal debit, BigDecimal credit) {
        if (debit == null || credit == null) {
            throw new IllegalArgumentException("debit/credit 금액은 필수입니다 (0 이상)");
        }
        if (debit.signum() < 0 || credit.signum() < 0) {
            throw new IllegalArgumentException("debit/credit 금액은 음수일 수 없습니다");
        }
        boolean debitPositive = debit.signum() > 0;
        boolean creditPositive = credit.signum() > 0;
        if (!debitPositive && !creditPositive) {
            throw new IllegalArgumentException("debit/credit 동시 0 은 허용되지 않습니다");
        }
        if (debitPositive && creditPositive) {
            throw new IllegalArgumentException("한 라인에 debit/credit 둘 다 양수일 수 없습니다");
        }
    }
}
