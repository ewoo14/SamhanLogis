package com.samhanair.logis.accounting.domain;

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

/** 수금계획 번호 채번 시퀀스 — 예정일별 last_seq 보조. */
@Entity
@Getter
@Table(name = "collection_plan_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CollectionPlanNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "planned_date", nullable = false, unique = true)
    private LocalDate plannedDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private CollectionPlanNumberSequence(LocalDate plannedDate) {
        this.plannedDate = plannedDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 새 예정일 시퀀스를 생성한다. */
    public static CollectionPlanNumberSequence create(LocalDate plannedDate) {
        return new CollectionPlanNumberSequence(plannedDate);
    }

    /** 다음 순번을 반환한다. */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
