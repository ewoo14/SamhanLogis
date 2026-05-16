package com.samhanair.logis.slip.estimate.domain;

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

/**
 * 견적번호 채번 시퀀스 — 일자별 last_seq 보조.
 *
 * <p>{@link com.samhanair.logis.slip.domain.SlipNumberSequence} 와 동일 패턴 —
 * 견적서 메뉴 자체가 업무 타입 구분자이므로 공개번호는 {@code yyyy/MM/dd-N} 이다.
 */
@Entity
@Getter
@Table(name = "estimate_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class EstimateNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "estimate_date", nullable = false)
    private LocalDate estimateDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private EstimateNumberSequence(LocalDate estimateDate) {
        this.estimateDate = estimateDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 신규 시퀀스 생성 — 해당 날짜 첫 발급 시 호출. */
    public static EstimateNumberSequence create(LocalDate estimateDate) {
        return new EstimateNumberSequence(estimateDate);
    }

    /** 다음 순번 반환 + lastSeq 증가. */
    public int next() {
        this.lastSeq += 1;
        return this.lastSeq;
    }
}
