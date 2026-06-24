package com.samhanair.logis.slip.domain.cutoff;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 출고전표 배송태그별 마감(컷오프) 시각 마스터.
 *
 * <p>{@link DeliveryTag} 의 OUTBOUND 방향 태그에 대해 당일 출고전표 생성을 차단할
 * 마감 시각을 관리한다. {@code active = true} 인 행만 게이트에 적용된다(opt-in).
 *
 * <p>사용자 화면 식별자는 {@link DeliveryTag#getKoreanLabel()} 이며, UUID 는 라우팅
 * 내부용이다 (feedback_uuid_no_user_visibility 가드).
 *
 * <p>soft-delete 는 {@link BaseEntity#markDeleted(String)} 만 사용한다(물리 삭제 금지).
 */
@Entity
@Getter
@Table(name = "slip_outbound_cutoff")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipOutboundCutoff extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 배송 태그 — {@link SlipType#OUTBOUND} 방향 태그만 허용.
     * DB 저장은 {@link DeliveryTag} enum name(VARCHAR) 으로 저장.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_tag", nullable = false, length = 40)
    private DeliveryTag deliveryTag;

    /**
     * 마감 시각(KST). 이 시각 이후 당일 출고전표 생성을 차단한다.
     * {@link java.time.Clock} 을 주입한 Guard 에서 {@code LocalTime.now(clock)} 과 비교.
     */
    @Column(name = "cutoff_time", nullable = false)
    private LocalTime cutoffTime;

    /**
     * 활성 여부. {@code false} 이면 마감 게이트 미적용(opt-in 해제).
     * {@link BaseEntity#markDeleted(String)} soft-delete 와 별개 상태다.
     */
    @Column(name = "active", nullable = false)
    private boolean active = true;

    private SlipOutboundCutoff(DeliveryTag deliveryTag, LocalTime cutoffTime) {
        this.deliveryTag = deliveryTag;
        this.cutoffTime = cutoffTime;
        this.active = true;
    }

    /**
     * 출고 마감시각 마스터를 생성한다.
     *
     * <p>OUTBOUND 방향 태그만 허용하며, 이외의 태그를 전달하면
     * {@link IllegalArgumentException} 을 던진다. 활성 태그 중복 검증은
     * 서비스 레이어({@link com.samhanair.logis.slip.service.cutoff.SlipOutboundCutoffService})
     * 와 DB 부분 unique index 에서 수행한다.
     *
     * @param deliveryTag OUTBOUND 방향 배송 태그 (null 불허)
     * @param cutoffTime  마감 시각(KST) (null 불허)
     * @return 영속화 전 {@link SlipOutboundCutoff}
     * @throws IllegalArgumentException deliveryTag 가 null 이거나 OUTBOUND 방향이 아닐 때
     */
    public static SlipOutboundCutoff create(DeliveryTag deliveryTag, LocalTime cutoffTime) {
        if (deliveryTag == null) {
            throw new IllegalArgumentException("deliveryTag 는 null 일 수 없습니다");
        }
        if (cutoffTime == null) {
            throw new IllegalArgumentException("cutoffTime 은 null 일 수 없습니다");
        }
        if (deliveryTag.getDirection() != SlipType.OUTBOUND) {
            throw new IllegalArgumentException(
                    "출고 마감시각 마스터는 OUTBOUND 방향 태그만 허용합니다: " + deliveryTag);
        }
        return new SlipOutboundCutoff(deliveryTag, cutoffTime);
    }

    /**
     * 마감 시각과 활성 여부를 수정한다.
     *
     * <p>{@code null} 인 경우 해당 필드를 미변경한다(PATCH 시맨틱).
     *
     * @param cutoffTime 새 마감 시각 (null 이면 미변경)
     * @param active     새 활성 여부 (null 이면 미변경)
     */
    public void changeTime(LocalTime cutoffTime, Boolean active) {
        if (cutoffTime != null) {
            this.cutoffTime = cutoffTime;
        }
        if (active != null) {
            this.active = active;
        }
    }

    /** 마감 게이트를 활성화한다. */
    public void activate() {
        this.active = true;
    }

    /** 마감 게이트를 비활성화한다. soft-delete 와 별개다. */
    public void deactivate() {
        this.active = false;
    }
}
