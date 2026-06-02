package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
     * S3 출고 예약 FIFO 후보 — product_code + warehouse_id + status 기준 received_at ASC 조회.
     *
     * @param productCode 품목코드 그룹
     * @param warehouseId 출고 원천 창고 UUID
     * @param status      대상 상태
     * @return 창고 범위 FIFO 인스턴스 목록
     */
    List<StockInstance> findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc(
            String productCode, UUID warehouseId, StockInstanceStatus status);

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
     * 품목별 인스턴스 전체 조회 — status 무관, productId 인덱스 활용.
     *
     * <p>status=null 시 findAll().filter() 전체 스캔 대신 이 메서드를 사용하여
     * {@code ix_stock_instances_product(product_id)} 인덱스를 활용한다.
     *
     * @param productId 제품 UUID
     * @return 해당 품목의 모든 인스턴스 목록 (soft-delete 필터 자동 적용)
     */
    List<StockInstance> findByProductId(UUID productId);

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

    /**
     * S3 출고연동 대상 조회 — 출고전표 번호 + 품목코드 + 상태 기준으로 예약/출고 인스턴스를 찾는다.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @param status         대상 상태
     * @return 해당 전표가 점유한 인스턴스 목록
     */
    List<StockInstance> findByOutboundSlipNoAndProductCodeAndStatus(
            String outboundSlipNo, String productCode, StockInstanceStatus status);

    /**
     * S3 출고연동 멱등 수량 확인 — 출고전표 번호 + 품목코드 + 상태 기준 건수.
     *
     * @param outboundSlipNo 출고전표 번호
     * @param productCode    품목코드 그룹
     * @param status         대상 상태
     * @return 해당 조건의 인스턴스 수
     */
    long countByOutboundSlipNoAndProductCodeAndStatus(
            String outboundSlipNo, String productCode, StockInstanceStatus status);

    /**
     * S2 입고 멱등 수량 확인 — 입고전표+품목 기준 기존 인스턴스 수를 센다.
     *
     * @param slipNo    입고전표 번호
     * @param productId 제품 UUID
     * @return 해당 전표+품목으로 생성된 인스턴스 수
     */
    @Query("""
            SELECT COUNT(s)
            FROM StockInstance s
            WHERE s.inboundSlipNo = :slipNo
              AND s.productId = :productId
              AND s.isDeleted = false
            """)
    long countByInboundSlipAndProduct(@Param("slipNo") String slipNo,
                                      @Param("productId") UUID productId);

    /**
     * S2 입고 멱등 응답용 기존 인스턴스 조회 — 입고전표+품목 기준으로 반환한다.
     *
     * @param slipNo    입고전표 번호
     * @param productId 제품 UUID
     * @return 해당 전표+품목으로 생성된 인스턴스 목록
     */
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.inboundSlipNo = :slipNo
              AND s.productId = :productId
              AND s.isDeleted = false
            ORDER BY s.receivedAt ASC, s.id ASC
            """)
    List<StockInstance> findByInboundSlipAndProduct(@Param("slipNo") String slipNo,
                                                    @Param("productId") UUID productId);
}
