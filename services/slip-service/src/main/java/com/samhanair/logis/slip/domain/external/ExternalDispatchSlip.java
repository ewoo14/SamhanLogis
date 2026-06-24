package com.samhanair.logis.slip.domain.external;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 타배송사 발송 이력과 전표의 매핑.
 *
 * <p>slipId 는 내부 참조용 UUID 이며 화면에는 전표번호(slipNo)만 표시한다.
 */
@Entity
@Getter
@Table(name = "external_dispatch_slip")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ExternalDispatchSlip extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "external_dispatch_id", nullable = false)
    private ExternalDispatch externalDispatch;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "sequence", nullable = false)
    private int sequence;

    private ExternalDispatchSlip(ExternalDispatch externalDispatch, UUID slipId, int sequence) {
        this.externalDispatch = externalDispatch;
        this.slipId = slipId;
        this.sequence = sequence;
    }

    /** 발송 이력에 포함된 전표 1건을 생성한다. */
    static ExternalDispatchSlip create(ExternalDispatch externalDispatch, UUID slipId, int sequence) {
        return new ExternalDispatchSlip(externalDispatch, slipId, sequence);
    }
}
