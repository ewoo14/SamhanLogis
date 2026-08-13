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

/** 영업수수료 정산서 문서번호의 정산 기준일별 시퀀스. */
@Entity
@Getter
@Table(name = "sales_commission_settlement_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesCommissionSettlementNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "settlement_date", nullable = false, unique = true)
    private LocalDate settlementDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private SalesCommissionSettlementNumberSequence(LocalDate settlementDate) {
        if (settlementDate == null) {
            throw new IllegalArgumentException("settlementDate 는 필수입니다");
        }
        this.settlementDate = settlementDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 신규 정산 기준일 시퀀스를 만든다. */
    public static SalesCommissionSettlementNumberSequence create(LocalDate settlementDate) {
        return new SalesCommissionSettlementNumberSequence(settlementDate);
    }

    /** 배타 잠금이 확보된 행에서 다음 순번을 증가시킨다. */
    public int next() {
        this.lastSeq++;
        return this.lastSeq;
    }
}
