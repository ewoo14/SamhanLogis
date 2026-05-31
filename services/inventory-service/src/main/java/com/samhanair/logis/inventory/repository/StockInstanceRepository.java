package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 개별시리얼 인스턴스 리포지토리 — {@code @SQLRestriction("is_deleted = false")} 으로 soft-delete 자동 필터.
 *
 * <p>FIFO/역-FIFO 메서드명은 JPA 쿼리 메서드 파생 규칙을 따르며, V15 마이그레이션 인덱스와 정합:
 * <ul>
 *   <li>FIFO 인덱스: {@code ix_stock_instances_fifo (product_code, status, received_at)}</li>
 *   <li>역-FIFO 인덱스: {@code ix_stock_instances_recall (outbound_partner_code, product_code, status, outbound_at)}</li>
 * </ul>
 */
public interface StockInstanceRepository extends JpaRepository<StockInstance, UUID> {

    /**
     * FIFO 소진 후보 — product_code 그룹의 지정 상태 인스턴스를 received_at ASC 순으로 조회.
     * 주로 {@link StockInstanceStatus#AVAILABLE} 상태 조회에 사용.
     *
     * @param productCode 품목코드 그룹
     * @param status      대상 상태
     * @return received_at 오름차순 인스턴스 목록 (FIFO 순)
     */
    List<StockInstance> findByProductCodeAndStatusOrderByReceivedAtAsc(
            String productCode, StockInstanceStatus status);

    /**
     * 역-FIFO 회수 후보 — 거래처+품목코드 기준 지정 상태 인스턴스를 outbound_at DESC 순으로 조회.
     * 주로 {@link StockInstanceStatus#SHIPPED} 상태 조회에 사용.
     *
     * @param outboundPartnerCode 출고 거래처 코드
     * @param productCode         품목코드 그룹
     * @param status              대상 상태
     * @return outbound_at 내림차순 인스턴스 목록 (역-FIFO 순)
     */
    List<StockInstance> findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(
            String outboundPartnerCode, String productCode, StockInstanceStatus status);

    /**
     * 품목별 인스턴스 조회 — productId + 상태 필터.
     *
     * @param productId 제품 UUID
     * @param status    대상 상태
     * @return 인스턴스 목록
     */
    List<StockInstance> findByProductIdAndStatus(UUID productId, StockInstanceStatus status);

    /**
     * 창고별 인스턴스 수 집계 — 대시보드/조회용.
     *
     * @param productCode 품목코드 그룹
     * @param warehouseId 창고 UUID
     * @param status      대상 상태
     * @return 해당 조건의 인스턴스 수
     */
    long countByProductCodeAndWarehouseIdAndStatus(
            String productCode, UUID warehouseId, StockInstanceStatus status);
}
