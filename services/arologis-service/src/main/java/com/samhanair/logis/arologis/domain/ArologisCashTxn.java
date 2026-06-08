package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 아로로지스 간이 현금 거래(단식부기 입출금 1건).
 *
 * <p>수입/지출 1건을 그대로 기록하는 단식부기 모델이다. 분개/차변·대변/마감/세금계산서 개념은 없으며,
 * {@code accountCode} 는 {@link ArologisSimpleAccount#getCode()} 를 가리키는 논리 FK 이다.
 *
 * <p>UUID 식별자는 화면 routing 한정으로만 노출하며 거래 식별은 비즈니스 속성을 우선한다.
 *
 * <p>BaseEntity 7 audit + Soft Delete ({@code @SQLRestriction}) 의무. hard delete 금지.
 */
@Entity
@Getter
@Table(name = "arologis_cash_txn")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ArologisCashTxn extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 거래 일자. 월별 집계의 기준이 된다. */
    @Column(name = "txn_date", nullable = false)
    private LocalDate txnDate;

    /** 수입/지출 구분. */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20, nullable = false)
    private CashTxnType type;

    /** 거래처명 — 자유 입력, null 가능. */
    @Column(name = "partner_name", length = 100)
    private String partnerName;

    /** 거래 금액 — NUMERIC(15,2), 항상 양수. */
    @Column(name = "amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** 계정과목 코드 — {@link ArologisSimpleAccount} 논리 FK. */
    @Column(name = "account_code", length = 8, nullable = false)
    private String accountCode;

    /** 적요/메모 — 자유 입력, null 가능. */
    @Column(name = "description", length = 255)
    private String description;

    private ArologisCashTxn(
            LocalDate txnDate,
            CashTxnType type,
            String partnerName,
            BigDecimal amount,
            String accountCode,
            String description) {
        validate(txnDate, type, amount, accountCode);
        this.txnDate = txnDate;
        this.type = type;
        this.partnerName = blankToNull(partnerName);
        this.amount = amount;
        this.accountCode = accountCode;
        this.description = blankToNull(description);
    }

    /** 신규 현금 거래 생성. amount 는 양수, accountCode 는 호출자가 존재 검증한다. */
    public static ArologisCashTxn create(
            LocalDate txnDate,
            CashTxnType type,
            String partnerName,
            BigDecimal amount,
            String accountCode,
            String description) {
        return new ArologisCashTxn(txnDate, type, partnerName, amount, accountCode, description);
    }

    /** 거래 내용 수정. soft-delete 된 거래는 서비스에서 미리 차단한다. */
    public void update(
            LocalDate txnDate,
            CashTxnType type,
            String partnerName,
            BigDecimal amount,
            String accountCode,
            String description) {
        validate(txnDate, type, amount, accountCode);
        this.txnDate = txnDate;
        this.type = type;
        this.partnerName = blankToNull(partnerName);
        this.amount = amount;
        this.accountCode = accountCode;
        this.description = blankToNull(description);
    }

    private static void validate(LocalDate txnDate, CashTxnType type, BigDecimal amount, String accountCode) {
        if (txnDate == null) {
            throw new IllegalArgumentException("txnDate 필수");
        }
        if (type == null) {
            throw new IllegalArgumentException("type 필수");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("금액은 0보다 커야 합니다");
        }
        if (accountCode == null || accountCode.isBlank()) {
            throw new IllegalArgumentException("accountCode 필수");
        }
    }

    private static String blankToNull(String raw) {
        return raw == null || raw.isBlank() ? null : raw;
    }
}
