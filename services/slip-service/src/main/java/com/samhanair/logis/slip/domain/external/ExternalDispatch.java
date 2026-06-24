package com.samhanair.logis.slip.domain.external;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 타배송사 발송 이력 헤더.
 *
 * <p>사용자 화면에는 배송사명/전화번호/전표번호만 노출하고, id/carrierId/slipId UUID 는
 * 내부 라우팅과 감사 추적에만 사용한다.
 */
@Entity
@Getter
@Table(name = "external_dispatch")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ExternalDispatch extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "carrier_id", nullable = false)
    private UUID carrierId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 10)
    private ExternalDispatchChannel channel;

    @Column(name = "dispatch_date", nullable = false)
    private LocalDate dispatchDate;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "sent_by")
    private UUID sentBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private ExternalDispatchStatus status;

    @OneToMany(mappedBy = "externalDispatch", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ExternalDispatchSlip> slips = new ArrayList<>();

    private ExternalDispatch(UUID carrierId, ExternalDispatchChannel channel, LocalDate dispatchDate, UUID sentBy) {
        this.carrierId = carrierId;
        this.channel = channel;
        this.dispatchDate = dispatchDate;
        this.sentBy = sentBy;
        this.status = ExternalDispatchStatus.FAILED;
    }

    /** SMS/인쇄 발송 이력 헤더를 생성한다. 실제 발송 결과는 markSent/markFailed 로 확정한다. */
    public static ExternalDispatch create(
            UUID carrierId,
            ExternalDispatchChannel channel,
            LocalDate dispatchDate,
            UUID sentBy
    ) {
        return new ExternalDispatch(carrierId, channel, dispatchDate, sentBy);
    }

    /** 전표 매핑을 sequence 순서로 추가한다. slipId UUID 는 내부 참조용이며 사용자 노출 식별자는 slipNo 다. */
    public ExternalDispatchSlip addSlip(UUID slipId, int sequence) {
        ExternalDispatchSlip row = ExternalDispatchSlip.create(this, slipId, sequence);
        this.slips.add(row);
        return row;
    }

    /** 발송 성공으로 확정한다. */
    public void markSent(LocalDateTime sentAt) {
        this.sentAt = sentAt;
        this.status = ExternalDispatchStatus.SENT;
    }

    /** 발송 실패로 확정한다. 전표 dispatchStatus 는 변경하지 않아 재시도 가능 상태를 유지한다. */
    public void markFailed() {
        this.sentAt = null;
        this.status = ExternalDispatchStatus.FAILED;
    }

    /** 외부에서 컬렉션을 직접 변경하지 못하도록 읽기 전용 view 를 제공한다. */
    public List<ExternalDispatchSlip> getSlips() {
        return Collections.unmodifiableList(slips);
    }
}
