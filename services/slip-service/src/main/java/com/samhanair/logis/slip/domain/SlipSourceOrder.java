package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 병합 발행 전표(Slip)의 출처 주문 N:1 추적 — Phase 2.6b D2 (V30).
 *
 * <p>여러 partner-order 를 단일 출고전표로 병합 발행할 때, 각 출처 주문을 1행씩 기록한다.
 * 단일주문 전환 경로는 {@code slip.source_id} 만 사용하며 이 테이블에 기록하지 않는다(회귀 0).
 * slip_id 는 같은 slip 의 여러 행을 가질 수 있고, partner_order_id 는 어느 주문에서 발행됐는지
 * 역조회(findBySource 보조)에 쓰인다.
 */
@Entity
@Getter
@Table(name = "slip_source_orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipSourceOrder extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 병합 발행된 전표 UUID (FK: slips.id). */
    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    /** 출처 주문 UUID (partner-order-service 의 partner_orders.id). */
    @Column(name = "partner_order_id", nullable = false)
    private UUID partnerOrderId;

    /** 출처 주문번호 — 사용자 노출 식별자 (UUID 비공개 원칙 준수). */
    @Column(name = "order_no", nullable = false, length = 64)
    private String orderNo;

    private SlipSourceOrder(UUID slipId, UUID partnerOrderId, String orderNo) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 필수");
        }
        if (partnerOrderId == null) {
            throw new IllegalArgumentException("partnerOrderId 필수");
        }
        if (orderNo == null || orderNo.isBlank()) {
            throw new IllegalArgumentException("orderNo 필수");
        }
        this.slipId = slipId;
        this.partnerOrderId = partnerOrderId;
        this.orderNo = orderNo;
    }

    /**
     * 출처 주문 1건 기록 생성.
     *
     * @param slipId         병합 발행된 전표 UUID
     * @param partnerOrderId 출처 주문 UUID
     * @param orderNo        출처 주문번호 (사용자 노출 식별자)
     * @return 영속화 전 인스턴스
     */
    public static SlipSourceOrder of(UUID slipId, UUID partnerOrderId, String orderNo) {
        return new SlipSourceOrder(slipId, partnerOrderId, orderNo);
    }
}
