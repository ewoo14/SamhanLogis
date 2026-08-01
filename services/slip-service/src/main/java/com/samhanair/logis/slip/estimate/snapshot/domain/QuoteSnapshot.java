package com.samhanair.logis.slip.estimate.snapshot.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/** 종합견적서의 JSON 상태·작성자·계산 합계를 저장하는 DB 스냅샷. */
@Entity
@Getter
@Table(name = "quote_snapshots")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class QuoteSnapshot extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 견적 작성자 이메일 — 수정 소유권의 기준. */
    @Column(name = "author_email", nullable = false, length = 255)
    private String authorEmail;

    /** 알림·필터·통계의 기준이 되는 견적 대상자 집합. 작성자는 항상 자동 포함한다. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "participant_emails", nullable = false, columnDefinition = "jsonb")
    private List<String> participantEmails;

    /** 거래처명 — 목록 표시용. */
    @Column(name = "cust_name", length = 200)
    private String custName;

    /** 재오픈·재계산에 사용하는 원본 JSON 상태. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot_state", nullable = false, columnDefinition = "jsonb")
    private JsonNode snapshotState;

    /** 저장 당시 공급가·부가세·총액. */
    @Column(name = "supply_amount", precision = 19, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", precision = 19, scale = 2)
    private BigDecimal vatAmount;

    @Column(name = "total_amount", precision = 19, scale = 2)
    private BigDecimal totalAmount;

    /** 신규 견적 스냅샷. */
    public QuoteSnapshot(String authorEmail, String custName, JsonNode snapshotState,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            LocalDateTime savedAt) {
        if (authorEmail == null || authorEmail.isBlank()) {
            throw new IllegalArgumentException("authorEmail 은 필수입니다");
        }
        if (snapshotState == null || snapshotState.isNull()) {
            throw new IllegalArgumentException("snapshotState 는 필수입니다");
        }
        this.authorEmail = authorEmail;
        this.participantEmails = List.of(authorEmail);
        this.custName = custName;
        this.snapshotState = snapshotState;
        this.supplyAmount = supplyAmount;
        this.vatAmount = vatAmount;
        this.totalAmount = totalAmount;
        this.setSavedAt(savedAt);
    }

    /** 본인만 저장 상태와 표시 정보를 수정한다. */
    public void update(String custName, JsonNode snapshotState, BigDecimal supplyAmount,
            BigDecimal vatAmount, BigDecimal totalAmount) {
        this.custName = custName;
        this.snapshotState = snapshotState;
        this.supplyAmount = supplyAmount;
        this.vatAmount = vatAmount;
        this.totalAmount = totalAmount;
    }

    /** 레거시 저장시각을 audit 시각과 구분해 보존한다. */
    @Column(name = "saved_at", nullable = false)
    private LocalDateTime savedAt;

    private void setSavedAt(LocalDateTime value) {
        this.savedAt = value != null ? value : LocalDateTime.now();
    }
}
