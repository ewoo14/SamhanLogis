package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 전표 일자 + 유형별 채번 보조 — {@link Slip#getSlipNo()} 의 {@code yyyy/MM/dd-N} 순번을
 * atomic 하게 관리한다. 판매/입고 전표는 서로 다른 메뉴/속성이므로 같은 날짜에 같은 공개번호를
 * 가질 수 있고, 동시 충돌은 {@code slips(slip_type, slip_no) WHERE is_deleted=false} 의 partial
 * unique 인덱스로 백업한다.
 */
@Entity
@Getter
@Table(name = "slip_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_type", nullable = false, length = 20)
    private SlipType slipType;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private SlipNumberSequence(LocalDate slipDate, SlipType slipType) {
        this.slipDate = slipDate;
        this.slipType = slipType;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /**
     * 새 날짜 시퀀스를 생성한다. lastSeq=0 으로 시작 — 다음 호출은 {@link #next()} 로 1 부터 부여.
     *
     * @param slipDate 채번 기준 날짜
     * @return lastSeq=0 의 신규 SlipNumberSequence
     */
    public static SlipNumberSequence create(LocalDate slipDate) {
        return create(slipDate, SlipType.OUTBOUND);
    }

    /**
     * 새 날짜 + 전표 유형 시퀀스를 생성한다. lastSeq=0 으로 시작한다.
     *
     * @param slipDate 채번 기준 날짜
     * @param slipType 판매/입고 전표 유형
     * @return lastSeq=0 의 신규 SlipNumberSequence
     */
    public static SlipNumberSequence create(LocalDate slipDate, SlipType slipType) {
        return new SlipNumberSequence(slipDate, slipType);
    }

    /**
     * 다음 순번을 계산한다. lastSeq 를 +1 증가시킨 뒤 그 값을 반환.
     *
     * @return 부여된 새 순번 (1, 2, 3, ...)
     */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
