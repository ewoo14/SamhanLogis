package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처 주문 변경 이력 (설계서 §3.4 — 8 event_type {@link HistoryEventType}).
 *
 * <p>#854 R2 에서 {@code SLIP_FAILED_PERMANENT} 가 추가되어 7 → 8 종. {@code event_type} 은
 * {@code VARCHAR(30)} 이고 CHECK 제약이 없어 마이그레이션 불요(값 21자). ※ V1 마이그레이션 주석의
 * "7 event_type" 은 적용된 마이그레이션이라 checksum 상 수정 대상이 아니다.
 *
 * <p>{@link #partnerOrderId} 는 nullable — DRAFT_* event 의 경우 PartnerOrder row 가 아직 없으므로
 * {@link #draftId} 만 채워질 수 있다. CONFIRMED 이후 event 는 {@link #partnerOrderId} 채워짐.
 */
@Entity
@Getter
@Table(name = "partner_order_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrderHistory extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** CONFIRMED 이후만 채워짐. */
    @Column(name = "partner_order_id")
    private UUID partnerOrderId;

    /** DRAFT_* event 의 경우 채워짐. */
    @Column(name = "draft_id")
    private UUID draftId;

    @Column(name = "partner_code", nullable = false, length = 50)
    private String partnerCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 30)
    private HistoryEventType eventType;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(name = "actor_user_id", nullable = false, length = 50)
    private String actorUserId;

    /** event 별 추가 컨텍스트 (slip-service 응답 status code 등). PostgreSQL TEXT — Hibernate 6 OID 회피. */
    @Column(name = "detail_json", columnDefinition = "TEXT")
    private String detailJson;

    private PartnerOrderHistory(UUID partnerOrderId, UUID draftId, String partnerCode,
                                HistoryEventType eventType, String actorUserId, String detailJson) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (eventType == null) {
            throw new IllegalArgumentException("eventType 필수");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 필수");
        }
        this.partnerOrderId = partnerOrderId;
        this.draftId = draftId;
        this.partnerCode = partnerCode;
        this.eventType = eventType;
        this.actorUserId = actorUserId;
        this.detailJson = detailJson;
        this.occurredAt = LocalDateTime.now();
    }

    /** Draft event (DRAFT_CREATED/UPDATED/DELETED) 기록. partnerOrderId=null. */
    public static PartnerOrderHistory ofDraft(UUID draftId, String partnerCode,
                                              HistoryEventType type, String actorUserId,
                                              String detailJson) {
        return new PartnerOrderHistory(null, draftId, partnerCode, type, actorUserId, detailJson);
    }

    /** Order event (CONFIRMED/SLIP_*) 기록. draftId=null. */
    public static PartnerOrderHistory ofOrder(UUID partnerOrderId, String partnerCode,
                                              HistoryEventType type, String actorUserId,
                                              String detailJson) {
        return new PartnerOrderHistory(partnerOrderId, null, partnerCode, type, actorUserId, detailJson);
    }
}
