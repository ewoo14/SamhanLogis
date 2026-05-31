package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipSourceOrder;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 병합 출처 주문 N:1 추적 리포지토리 — Phase 2.6b D2.
 *
 * <p>{@code slip_source_orders} 테이블(V30) 을 다루며, 병합 발행 전표의 출처 주문 역조회를
 * 지원한다. {@code @SQLRestriction("is_deleted = false")} 가 엔티티에 적용되어 있으므로
 * 아래 메서드는 soft-delete 된 행을 자동으로 제외한다.
 */
public interface SlipSourceOrderRepository extends JpaRepository<SlipSourceOrder, UUID> {

    /**
     * 특정 전표의 출처 주문 전체 조회.
     *
     * @param slipId 병합 발행 전표 UUID
     * @return 해당 전표에 대한 출처 주문 목록 (soft-delete 제외)
     */
    List<SlipSourceOrder> findAllBySlipId(UUID slipId);

    /**
     * 특정 출처 주문이 병합된 전표 추적 목록 — {@code findBySource} UNION 보조.
     *
     * @param partnerOrderId 출처 주문 UUID
     * @return 해당 주문이 병합된 SlipSourceOrder 목록 (soft-delete 제외)
     */
    List<SlipSourceOrder> findAllByPartnerOrderId(UUID partnerOrderId);
}
