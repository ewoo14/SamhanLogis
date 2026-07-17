package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 통장 입출금 거래 도메인.
 *
 * <p>row UUID, matchedPartnerId, matchedJournalId 는 내부 join 키로만 보관한다.
 * 사용자 화면/API 응답은 거래일시, 통장 표시명, 적요, 거래처 표시 식별자만 사용한다.
 *
 * <p>CSV/KFTC 모두 같은 엔티티에 적재하고, import adapter 만 달라진다.
 */
@Entity
@Getter
@Table(name = "bank_transaction")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BankTransaction extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "transacted_at", nullable = false)
    private LocalDateTime transactedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "txn_type", nullable = false, length = 20)
    private BankTxnType txnType;

    @Column(name = "amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "balance_after", precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    @Column(name = "description", nullable = false, length = 500)
    private String description;

    @Column(name = "counterparty_name", length = 120)
    private String counterpartyName;

    @Column(name = "counterparty_account", length = 80)
    private String counterpartyAccount;

    @Column(name = "bank_account_label", nullable = false, length = 120)
    private String bankAccountLabel;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private BankTxnSource source;

    @Column(name = "external_ref", nullable = false, length = 128)
    private String externalRef;

    @Column(name = "card_name", length = 100)
    private String cardName;

    @Column(name = "approval_id", length = 128)
    private String approvalId;

    @Column(name = "loan_name", length = 100)
    private String loanName;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_status", nullable = false, length = 20)
    private MatchStatus matchStatus;

    /** 매칭 거래처 내부 UUID. API/화면에는 노출하지 않는다. */
    @Column(name = "matched_partner_id")
    private UUID matchedPartnerId;

    /** 거래처 매칭 provenance. 자동 오배정 사후 추적용이며 API에는 enum 이름만 노출한다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "partner_match_source", length = 30)
    private PartnerMatchSource partnerMatchSource;

    /** 자동 적용에 사용된 매핑 내부 UUID. API에는 노출하지 않는다. */
    @Column(name = "matched_mapping_id")
    private UUID matchedMappingId;

    /** 마지막 거래처 매칭 시각. */
    @Column(name = "partner_matched_at")
    private LocalDateTime partnerMatchedAt;

    /** 마지막 거래처 매칭 실행자 내부 식별자. */
    @Column(name = "partner_matched_by", length = 50)
    private String partnerMatchedBy;

    /** 적용 당시 매핑 원본명 snapshot. 매핑 rename/delete 뒤에도 근거를 보존한다. */
    @Column(name = "matched_mapping_raw_name", length = 120)
    private String matchedMappingRawName;

    /** 적용 당시 매핑 정규화명 snapshot. */
    @Column(name = "matched_mapping_normalized_name", length = 120)
    private String matchedMappingNormalizedName;

    /** 매칭 분개 내부 UUID. API/화면에는 노출하지 않는다. */
    @Column(name = "matched_journal_id")
    private UUID matchedJournalId;

    /** 통장연계 입금보고서 내부 UUID. API/화면에는 slipNo 만 노출한다. */
    @Column(name = "cash_receipt_id")
    private UUID cashReceiptId;

    private BankTransaction(LocalDateTime transactedAt, BankTxnType txnType, BigDecimal amount,
                            BigDecimal balanceAfter, String description, String counterpartyName,
                            String counterpartyAccount, String bankAccountLabel, BankTxnSource source,
                            String externalRef) {
        validateRequired(transactedAt, txnType, amount, description, bankAccountLabel, source, externalRef);
        this.transactedAt = transactedAt;
        this.txnType = txnType;
        this.amount = amount;
        this.balanceAfter = balanceAfter;
        this.description = description.trim();
        this.counterpartyName = blankToNull(counterpartyName);
        this.counterpartyAccount = blankToNull(counterpartyAccount);
        this.bankAccountLabel = bankAccountLabel.trim();
        this.source = source;
        this.externalRef = externalRef.trim();
        this.matchStatus = MatchStatus.UNREFLECTED;
    }

    /**
     * import adapter 에서 통장 거래를 생성한다.
     *
     * @return 미반영 상태의 통장 거래
     */
    public static BankTransaction importRow(LocalDateTime transactedAt, BankTxnType txnType, BigDecimal amount,
                                            BigDecimal balanceAfter, String description, String counterpartyName,
                                            String counterpartyAccount, String bankAccountLabel,
                                            BankTxnSource source, String externalRef) {
        return new BankTransaction(transactedAt, txnType, amount, balanceAfter, description, counterpartyName,
                counterpartyAccount, bankAccountLabel, source, externalRef);
    }

    /**
     * CODEF 카드 승인 거래의 카드 식별 정보를 부여한다.
     *
     * <p>은행 거래에는 호출하지 않는다. 승인번호는 CODEF 카드 거래의 외부 비즈니스 식별자이며 UUID 가 아니다.
     */
    public BankTransaction attachCardInfo(String cardName, String approvalId) {
        this.cardName = blankToNull(cardName);
        this.approvalId = blankToNull(approvalId);
        return this;
    }

    /**
     * CODEF 대출 거래의 대출 식별 정보를 부여한다.
     *
     * <p>대출명은 CODEF 대출 상품의 비즈니스 표시값이며 내부 UUID 가 아니다.
     */
    public BankTransaction attachLoanInfo(String loanName) {
        this.loanName = blankToNull(loanName);
        return this;
    }

    /**
     * 미반영 거래에 거래처를 매칭한다.
     *
     * <p>이미 거래처가 매칭된 미반영(UNREFLECTED) 거래의 재지정(덮어쓰기)은 허용한다 — 회계 반영 전
     * 단순 지정이라 오지정 정정 UX 가 자연스럽다. 변경 이력은 BaseEntity modifiedAt/modifiedBy 로 추적.
     * 회계반영(REFLECTED)/강제(FORCED) 거래의 재지정은 거부(409).
     */
    public BankTransaction matchPartner(UUID partnerId) {
        return applyPartnerMatch(partnerId, PartnerMatchSource.MANUAL, null,
                LocalDateTime.now(), "SYSTEM", null, null);
    }

    /**
     * provenance를 포함해 거래처를 지정한다.
     *
     * @param partnerId 거래처 내부 UUID
     * @param source 매칭 출처
     * @param mappingId 자동 매핑 내부 UUID, 수동/코드일치는 null
     * @param matchedAt 매칭 시각
     * @param matchedBy 실행자 내부 식별자
     * @param mappingRawName 적용 매핑 원본명 snapshot
     * @param mappingNormalizedName 적용 매핑 정규화명 snapshot
     * @return 변경된 거래
     */
    public BankTransaction applyPartnerMatch(UUID partnerId, PartnerMatchSource source, UUID mappingId,
                                             LocalDateTime matchedAt, String matchedBy,
                                             String mappingRawName, String mappingNormalizedName) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (source == null) {
            throw new IllegalArgumentException("partnerMatchSource 는 필수입니다");
        }
        if (source == PartnerMatchSource.DEPOSITOR_MAPPING && mappingId == null) {
            throw new IllegalArgumentException("DEPOSITOR_MAPPING 은 mappingId 가 필수입니다");
        }
        if (source == PartnerMatchSource.DEPOSITOR_MAPPING
                && (mappingRawName == null || mappingRawName.isBlank()
                || mappingNormalizedName == null || mappingNormalizedName.isBlank())) {
            throw new IllegalArgumentException("DEPOSITOR_MAPPING 은 mapping snapshot이 필수입니다");
        }
        if (source != PartnerMatchSource.DEPOSITOR_MAPPING && mappingId != null) {
            throw new IllegalArgumentException("매핑 출처가 아니면 mappingId 를 지정할 수 없습니다");
        }
        if (source != PartnerMatchSource.DEPOSITOR_MAPPING
                && (mappingRawName != null || mappingNormalizedName != null)) {
            throw new IllegalArgumentException("DEPOSITOR_MAPPING 외 출처는 mapping snapshot을 가질 수 없습니다");
        }
        requireUnreflected("매칭");
        this.matchedPartnerId = partnerId;
        this.partnerMatchSource = source;
        this.matchedMappingId = mappingId;
        this.partnerMatchedAt = matchedAt == null ? LocalDateTime.now() : matchedAt;
        this.partnerMatchedBy = matchedBy == null || matchedBy.isBlank() ? "SYSTEM" : matchedBy;
        this.matchedMappingRawName = mappingRawName;
        this.matchedMappingNormalizedName = mappingNormalizedName;
        return this;
    }

    /** 미반영 거래의 거래처 매칭을 해제한다. 회계반영/강제 거래는 거부(409). */
    public BankTransaction clearPartner() {
        requireUnreflected("해제");
        this.matchedPartnerId = null;
        this.partnerMatchSource = null;
        this.matchedMappingId = null;
        this.partnerMatchedAt = null;
        this.partnerMatchedBy = null;
        this.matchedMappingRawName = null;
        this.matchedMappingNormalizedName = null;
        return this;
    }

    /** 미반영 거래를 회계 분개 반영 상태로 전환한다. */
    public BankTransaction markReflected(UUID journalId) {
        if (journalId == null) {
            throw new IllegalArgumentException("journalId 는 필수입니다");
        }
        requireStatus(MatchStatus.REFLECTED, MatchStatus.UNREFLECTED);
        this.matchedJournalId = journalId;
        this.matchStatus = MatchStatus.REFLECTED;
        return this;
    }

    /**
     * 통장연계 입금보고서와 분개를 동시에 연결하고 회계 반영 상태로 전환한다.
     *
     * <p>기존 {@link #markReflected(UUID)} 시그니처는 강제/수동 반영 경로 호환을 위해 보존하고,
     * 입금보고서 링크가 필요한 S3 경로는 본 메서드를 사용한다.
     */
    public BankTransaction linkCashReceipt(UUID receiptId, UUID journalId) {
        if (receiptId == null) {
            throw new IllegalArgumentException("receiptId 는 필수입니다");
        }
        markReflected(journalId);
        this.cashReceiptId = receiptId;
        return this;
    }

    /** 통장연계 입금보고서 취소 시 다시 미반영 상태로 되돌리고 연결 키를 제거한다. */
    public BankTransaction unlinkCashReceipt() {
        if (this.cashReceiptId == null) {
            return this;
        }
        requireStatus(MatchStatus.UNREFLECTED, MatchStatus.REFLECTED);
        this.matchStatus = MatchStatus.UNREFLECTED;
        this.matchedJournalId = null;
        this.cashReceiptId = null;
        return this;
    }

    /** 미반영 거래를 강제 반영 상태로 전환한다. */
    public BankTransaction markForced(UUID journalId) {
        if (journalId == null) {
            throw new IllegalArgumentException("journalId 는 필수입니다");
        }
        requireStatus(MatchStatus.FORCED, MatchStatus.UNREFLECTED);
        this.matchedJournalId = journalId;
        this.matchStatus = MatchStatus.FORCED;
        return this;
    }

    /**
     * 거래처 매칭/해제는 미반영(UNREFLECTED) 거래에만 허용한다.
     *
     * <p>과거 {@link IllegalStateException} 로 던져 GlobalExceptionHandler 의 catch-all(500)에
     * 걸려 사유가 마스킹되는 결함이 있었다 — {@link BusinessException}(CONFLICT) 승격으로
     * 409 + 실제 한국어 사유가 응답되도록 수정(#724 fix 6a).
     */
    private void requireUnreflected(String action) {
        if (this.matchStatus != MatchStatus.UNREFLECTED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "미반영 상태가 아니라(현재 " + matchStatus.getDisplayName() + ") 거래처 " + action + "을(를) 할 수 없습니다.");
        }
    }

    private void requireStatus(MatchStatus target, MatchStatus... allowed) {
        for (MatchStatus candidate : allowed) {
            if (this.matchStatus == candidate) {
                return;
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "현재 상태(" + matchStatus.getDisplayName() + ")에서는 " + target.getDisplayName() + " 전환이 허용되지 않습니다.");
    }

    private static void validateRequired(LocalDateTime transactedAt, BankTxnType txnType, BigDecimal amount,
                                         String description, String bankAccountLabel, BankTxnSource source,
                                         String externalRef) {
        if (transactedAt == null) {
            throw new IllegalArgumentException("transactedAt 은 필수입니다");
        }
        if (txnType == null) {
            throw new IllegalArgumentException("txnType 은 필수입니다");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("amount 는 0보다 커야 합니다");
        }
        if (description == null || description.isBlank()) {
            throw new IllegalArgumentException("description 은 필수입니다");
        }
        if (bankAccountLabel == null || bankAccountLabel.isBlank()) {
            throw new IllegalArgumentException("bankAccountLabel 은 필수입니다");
        }
        if (source == null) {
            throw new IllegalArgumentException("source 는 필수입니다");
        }
        if (externalRef == null || externalRef.isBlank()) {
            throw new IllegalArgumentException("externalRef 는 필수입니다");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
