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
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 입금보고서 기반 현금 회수 도메인. */
@Entity
@Getter
@Table(name = "cash_receipts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CashReceipt extends BaseEntity {

    /** 기본 차변 계정: 보통예금(102) — V1 chart_of_accounts 시드 기준. */
    public static final String DEFAULT_DEBIT_ACCOUNT_CODE = "102";

    /** 기본 대변 계정: 외상매출금(110) — V1 chart_of_accounts 시드 기준. */
    public static final String DEFAULT_CREDIT_ACCOUNT_CODE = "110";

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_no", nullable = false, length = 30)
    private String slipNo;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 30)
    private CashReceiptKind kind;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CashReceiptStatus status = CashReceiptStatus.DRAFT;

    @Column(name = "debit_account_code", nullable = false, length = 20)
    private String debitAccountCode = DEFAULT_DEBIT_ACCOUNT_CODE;

    @Column(name = "credit_account_code", nullable = false, length = 20)
    private String creditAccountCode = DEFAULT_CREDIT_ACCOUNT_CODE;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "journal_id")
    private UUID journalId;

    /** 취소 시 생성된 역분개 Journal UUID. 화면에는 전표번호로만 노출한다. */
    @Column(name = "reverse_journal_id")
    private UUID reverseJournalId;

    @Column(name = "external_ref", nullable = false, length = 100)
    private String externalRef;

    /** 거래처별 분할 행 JSON. null이면 행 구조 도입 전 legacy 단일 amount 데이터다. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "lines_json", columnDefinition = "jsonb")
    private String linesJson;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public static CashReceipt fromMig7Staging(String slipNo, UUID partnerId, BigDecimal amount,
                                              LocalDate transactionDate, CashReceiptKind kind, String memo,
                                              String externalRef) {
        CashReceipt receipt = new CashReceipt();
        receipt.assignRequired(slipNo, partnerId, amount, transactionDate,
                kind == null ? CashReceiptKind.DEPOSIT_REPORT : kind, externalRef);
        receipt.memo = memo;
        receipt.status = CashReceiptStatus.CONFIRMED;
        return receipt;
    }

    /**
     * 수기 입금보고서 생성. 생성 시점에는 분개가 없고(journalId=null) 확정(confirm) 시 게시된다.
     */
    public static CashReceipt createManual(String slipNo, UUID partnerId, BigDecimal amount,
                                           LocalDate transactionDate, String memo,
                                           String debitAccountCode, String creditAccountCode) {
        CashReceipt receipt = new CashReceipt();
        receipt.assignRequired(slipNo, partnerId, amount, transactionDate,
                CashReceiptKind.MANUAL_RECEIPT, manualExternalRef(slipNo));
        receipt.memo = memo;
        receipt.status = CashReceiptStatus.DRAFT;
        receipt.debitAccountCode = normalizeAccountCode(debitAccountCode, DEFAULT_DEBIT_ACCOUNT_CODE);
        receipt.creditAccountCode = normalizeAccountCode(creditAccountCode, DEFAULT_CREDIT_ACCOUNT_CODE);
        return receipt;
    }

    /**
     * 통장거래 합산 입금보고서 생성. 생성 직후 service 가 {@link #confirm()} 과 자동 분개 게시를 이어서 수행한다.
     */
    public static CashReceipt createBankLinked(String slipNo, UUID partnerId, BigDecimal amount,
                                               LocalDate transactionDate, String memo,
                                               String debitAccountCode, String creditAccountCode) {
        CashReceipt receipt = new CashReceipt();
        receipt.assignRequired(slipNo, partnerId, amount, transactionDate,
                CashReceiptKind.BANK_LINKED, bankLinkedExternalRef(slipNo));
        receipt.memo = memo;
        receipt.status = CashReceiptStatus.DRAFT;
        receipt.debitAccountCode = normalizeAccountCode(debitAccountCode, DEFAULT_DEBIT_ACCOUNT_CODE);
        receipt.creditAccountCode = normalizeAccountCode(creditAccountCode, DEFAULT_CREDIT_ACCOUNT_CODE);
        return receipt;
    }

    /**
     * DRAFT 입금보고서 수정.
     *
     * @return 현재 입금보고서
     */
    public CashReceipt updateDraft(BigDecimal amount, LocalDate transactionDate, String memo,
                                   UUID partnerId, String debitAccountCode, String creditAccountCode) {
        requireDraft("입금보고서 수정은 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
        return applyEditableFields(amount, transactionDate, memo, partnerId, debitAccountCode, creditAccountCode);
    }

    /**
     * CONFIRMED 입금보고서 수정.
     *
     * <p>원장 불변 원칙에 따라 기존 분개 정정은 service 에서 역분개+신규 게시로 처리하고,
     * 본 메서드는 입금보고서 헤더 필드만 갱신한다.
     *
     * @return 현재 입금보고서
     */
    public CashReceipt updateConfirmed(BigDecimal amount, LocalDate transactionDate, String memo,
                                       UUID partnerId, String debitAccountCode, String creditAccountCode) {
        if (this.status != CashReceiptStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    CashReceiptStatus.CONFIRMED.getDisplayName()
                            + " 입금보고서만 재게시 수정할 수 있습니다 (현재: "
                            + this.status.getDisplayName() + ")");
        }
        return applyEditableFields(amount, transactionDate, memo, partnerId, debitAccountCode, creditAccountCode);
    }

    /** 편집 가능 필드 일괄 갱신 — DRAFT/CONFIRMED 수정의 공통 본문(상태 가드는 각 진입점 소관). */
    private CashReceipt applyEditableFields(BigDecimal amount, LocalDate transactionDate, String memo,
                                            UUID partnerId, String debitAccountCode, String creditAccountCode) {
        validatePartnerId(partnerId);
        validateAmount(amount);
        validateTransactionDate(transactionDate);
        this.amount = amount;
        this.transactionDate = transactionDate;
        this.memo = memo;
        this.partnerId = partnerId;
        this.debitAccountCode = normalizeAccountCode(debitAccountCode, DEFAULT_DEBIT_ACCOUNT_CODE);
        this.creditAccountCode = normalizeAccountCode(creditAccountCode, DEFAULT_CREDIT_ACCOUNT_CODE);
        return this;
    }

    /** DRAFT → CONFIRMED. 상태만 전환하며, POSTED 분개 게시는 service(confirm)가 이어서 수행한다. */
    public CashReceipt confirm() {
        requireDraft("입금보고서 확정은 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
        this.status = CashReceiptStatus.CONFIRMED;
        return this;
    }

    /** CONFIRMED → CANCELLED. 상태만 전환하며, 원분개 역분개는 service(cancel)가 이어서 수행한다. */
    public CashReceipt cancel() {
        if (this.status != CashReceiptStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "입금보고서 취소는 " + CashReceiptStatus.CONFIRMED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        this.status = CashReceiptStatus.CANCELLED;
        return this;
    }

    /** DRAFT 입금보고서만 soft-delete 한다. */
    public CashReceipt softDeleteDraft(String actor) {
        requireDraft("입금보고서 삭제는 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    /** 분개 연결 — 확정(confirm)·수정 재게시(updateConfirmed) 경로가 호출한다. */
    public CashReceipt linkJournal(UUID journalId) {
        this.journalId = journalId;
        return this;
    }

    /** 취소 역분개 Journal 연결. */
    public CashReceipt linkReverseJournal(UUID reverseJournalId) {
        this.reverseJournalId = reverseJournalId;
        return this;
    }

    /** 분할 행 JSON을 저장한다. 행 해석과 합계 검증은 service가 담당한다. */
    public CashReceipt replaceLinesJson(String linesJson) {
        this.linesJson = linesJson;
        return this;
    }

    private void assignRequired(String slipNo, UUID partnerId, BigDecimal amount,
                                LocalDate transactionDate, CashReceiptKind kind, String externalRef) {
        validateSlipNo(slipNo);
        validatePartnerId(partnerId);
        validateAmount(amount);
        validateTransactionDate(transactionDate);
        if (kind == null) {
            throw new IllegalArgumentException("kind 는 필수입니다");
        }
        if (externalRef == null || externalRef.isBlank() || externalRef.length() > 100) {
            throw new IllegalArgumentException("externalRef 는 1~100자 필수입니다");
        }
        this.slipNo = slipNo;
        this.partnerId = partnerId;
        this.amount = amount;
        this.transactionDate = transactionDate;
        this.kind = kind;
        this.externalRef = externalRef;
    }

    /** DRAFT 상태 요구 가드. service 선검증과 도메인 mutation 에서 공통 사용한다. */
    public CashReceipt requireDraft(String message) {
        if (this.status != CashReceiptStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    message + " (현재: " + this.status.getDisplayName() + ")");
        }
        return this;
    }

    private static String manualExternalRef(String slipNo) {
        return "MANUAL:" + slipNo;
    }

    private static String bankLinkedExternalRef(String slipNo) {
        return "BANK_LINKED:" + slipNo;
    }

    private static void validateSlipNo(String slipNo) {
        if (slipNo == null || slipNo.isBlank() || slipNo.length() > 30) {
            throw new IllegalArgumentException("slipNo 는 1~30자 필수입니다");
        }
    }

    private static void validatePartnerId(UUID partnerId) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
    }

    private static void validateAmount(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("amount 는 0보다 커야 합니다");
        }
    }

    private static void validateTransactionDate(LocalDate transactionDate) {
        if (transactionDate == null) {
            throw new IllegalArgumentException("transactionDate 는 필수입니다");
        }
    }

    private static String normalizeAccountCode(String accountCode, String defaultCode) {
        String normalized = accountCode == null || accountCode.isBlank() ? defaultCode : accountCode.trim();
        if (normalized.length() > 20) {
            throw new IllegalArgumentException("accountCode 는 최대 20자입니다");
        }
        return normalized;
    }
}
