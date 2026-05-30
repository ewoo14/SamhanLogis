package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PartnerOrderLineRepository extends JpaRepository<PartnerOrderLine, UUID> {

    /** PartnerOrder 의 active 라인 조회 ({@code @SQLRestriction("is_deleted = false")} 자동 적용). */
    List<PartnerOrderLine> findAllByPartnerOrder_Id(UUID partnerOrderId);

    /**
     * soft-deleted 라인을 포함한 특정 주문의 전체 라인을 조회한다 (Phase 2.4 restore 전처리용).
     *
     * <p>@SQLRestriction("is_deleted = false") 를 우회하기 위해 nativeQuery 를 사용한다.
     * soft-deleted 주문 복원(undelete) 후 기존에 soft-delete 된 라인을 명시적으로
     * markDeleted 처리해 DB 에 중복 잔존하지 않도록 보장한다.
     *
     * @param partnerOrderId 대상 주문 UUID
     * @return soft-deleted 포함 전체 PartnerOrderLine 목록
     */
    @Query(value = "SELECT * FROM partner_order_lines WHERE partner_order_id = :partnerOrderId",
            nativeQuery = true)
    List<PartnerOrderLine> findAllIncludingDeletedByPartnerOrderId(
            @Param("partnerOrderId") UUID partnerOrderId);
}
