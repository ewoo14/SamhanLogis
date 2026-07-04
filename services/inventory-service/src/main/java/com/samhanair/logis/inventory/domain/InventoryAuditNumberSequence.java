package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 재고 실사번호 채번 시퀀스 — 발행일별 last_seq 보조. */
@Entity
@Getter
@Table(name = "inventory_audit_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InventoryAuditNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "audit_date", nullable = false, unique = true)
    private LocalDate auditDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private InventoryAuditNumberSequence(LocalDate auditDate) {
        this.auditDate = auditDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 새 발행일 시퀀스를 생성한다. */
    public static InventoryAuditNumberSequence create(LocalDate auditDate) {
        return new InventoryAuditNumberSequence(auditDate);
    }

    /** 다음 순번을 반환한다. */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
