package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** MIG-6 이카운트 통장계좌 마스터. */
@Entity
@Getter
@Table(name = "bank_accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BankAccount extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "account_code", nullable = false, length = 50)
    private String accountCode;

    @Column(name = "account_name", nullable = false, length = 100)
    private String accountName;

    @Column(name = "chart_account_code", length = 10)
    private String chartAccountCode;

    @Column(name = "search_content", columnDefinition = "TEXT")
    private String searchContent;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    @Column(name = "foreign_currency", nullable = false)
    private boolean foreignCurrency;

    @Column(name = "active", nullable = false)
    private boolean active;
}
