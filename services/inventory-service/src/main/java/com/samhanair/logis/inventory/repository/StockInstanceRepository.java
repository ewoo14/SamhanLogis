package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import java.util.List;
import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
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

    long countByInboundSlipNoAndIsDeletedFalse(String inboundSlipNo);

    long countByOutboundSlipNoAndIsDeletedFalse(String outboundSlipNo);

    /** 사용자 노출용 serial_key로 활성 인스턴스를 단건 조회한다. */
    Optional<StockInstance> findBySerialKey(String serialKey);

    /** 모델명 전환 이후 product UUID로 AVAILABLE FIFO 후보를 조회한다. */
    List<StockInstance> findByProductIdAndStatusOrderByReceivedAtAsc(
            UUID productId, StockInstanceStatus status);

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
     * S3 출고 예약 FIFO 후보 — 후보 행을 {@code SELECT FOR UPDATE} 로 잠가 교차 전표 중복 선택을 방지한다.
     *
     * @param productCode 품목코드 그룹
     * @param warehouseId 출고 원천 창고 UUID
     * @param status      대상 상태
     * @param pageable    잠금 후보 제한(PageRequest.of(0, deficit))
     * @return 창고 범위 FIFO 인스턴스 목록 (row lock 보유)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.productCode = :productCode
              AND s.warehouseId = :warehouseId
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.receivedAt ASC, s.id ASC
            """)
    List<StockInstance> findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
            @Param("productCode") String productCode,
            @Param("warehouseId") UUID warehouseId,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    /** 모델명 전환 후에도 product UUID로 legacy product_code 저장 행을 예약한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.productId = :productId
              AND s.warehouseId = :warehouseId
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.receivedAt ASC, s.id ASC
            """)
    List<StockInstance> findByProductIdAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
            @Param("productId") UUID productId,
            @Param("warehouseId") UUID warehouseId,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    /**
     * 역-FIFO 회수 후보 — 거래처+품목코드 기준 지정 상태 인스턴스를 outbound_at DESC 순으로 조회.
     * 주로 {@link StockInstanceStatus#SHIPPED} 상태 조회에 사용.
     *
     * @param outboundPartnerCode 출고 거래처 코드
     * @param productCode         품목코드 그룹
     * @param status              대상 상태
     * @return outbound_at 내림차순 인스턴스 목록 (역-FIFO 순)
     */
    List<StockInstance> findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc(
            String outboundPartnerCode, String productCode, StockInstanceStatus status);

    /** 모델명 전환 이후 product UUID로 SHIPPED 역-FIFO 후보를 조회한다. */
    List<StockInstance> findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAsc(
            String outboundPartnerCode, UUID productId, StockInstanceStatus status);

    /**
     * S4 회수 역-FIFO 후보 — 후보 행을 {@code SELECT FOR UPDATE} 로 잠가 교차 전표 중복 회수를 방지한다.
     *
     * @param outboundPartnerCode 출고 거래처 코드
     * @param productCode         품목코드 그룹
     * @param status              대상 상태
     * @param pageable            잠금 후보 제한(PageRequest.of(0, deficit))
     * @return outbound_at 내림차순 인스턴스 목록 (row lock 보유)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.outboundPartnerCode = :outboundPartnerCode
              AND s.productCode = :productCode
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.outboundAt DESC, s.id ASC
            """)
    List<StockInstance> findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
            @Param("outboundPartnerCode") String outboundPartnerCode,
            @Param("productCode") String productCode,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    /** 모델명 전환 후에도 product UUID로 legacy product_code 저장 행을 회수한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.outboundPartnerCode = :outboundPartnerCode
              AND s.productId = :productId
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.outboundAt DESC, s.id ASC
            """)
    List<StockInstance> findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAscForUpdate(
            @Param("outboundPartnerCode") String outboundPartnerCode,
            @Param("productId") UUID productId,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    long countByOutboundSlipNoAndProductIdAndStatus(
            String outboundSlipNo, UUID productId, StockInstanceStatus status);

    List<StockInstance> findByOutboundSlipNoAndProductIdAndStatus(
            String outboundSlipNo, UUID productId, StockInstanceStatus status);

    long countByRecallSlipNoAndProductIdAndStatus(
            String recallSlipNo, UUID productId, StockInstanceStatus status);

    List<StockInstance> findByRecallSlipNoAndProductIdAndStatus(
            String recallSlipNo, UUID productId, StockInstanceStatus status);

    /**
     * 회수 대상 수량 확인 — 거래처+품목코드+상태 기준 건수.
     *
     * @param outboundPartnerCode 출고 거래처 코드
     * @param productCode         품목코드 그룹
     * @param status              대상 상태
     * @return 해당 조건의 인스턴스 수
     */
    long countByOutboundPartnerCodeAndProductCodeAndStatus(
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

    /** 화면 품목리스트용 품목코드 단위 조회. */
    List<StockInstance> findByProductCodeOrderByReceivedAtAsc(String productCode);


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
     * S4 회수연동 대상 조회 — 회수전표 번호 + 품목코드 + 상태 기준으로 회수된 인스턴스를 찾는다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @param status       대상 상태
     * @return 해당 전표로 회수 처리된 인스턴스 목록
     */
    List<StockInstance> findByRecallSlipNoAndProductCodeAndStatus(
            String recallSlipNo, String productCode, StockInstanceStatus status);

    /**
     * S4 회수취소(unrecall) 대상 조회(row lock) — recallSlipNo+productCode+상태(RECALLED) 행을
     * {@code PESSIMISTIC_WRITE} 로 잠가 unrecall-batch endpoint 직접 동시호출 시 같은 행 중복 전이를 방지한다. (BE 리뷰 P1)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.recallSlipNo = :recallSlipNo
              AND s.productCode = :productCode
              AND s.status = :status
              AND s.isDeleted = false
            """)
    List<StockInstance> findByRecallSlipNoAndProductCodeAndStatusForUpdate(
            @Param("recallSlipNo") String recallSlipNo,
            @Param("productCode") String productCode,
            @Param("status") StockInstanceStatus status);

    /** 모델명 전환 후에도 product UUID로 회수취소 대상 legacy product_code 행을 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.recallSlipNo = :recallSlipNo
              AND s.productId = :productId
              AND s.status = :status
              AND s.isDeleted = false
            """)
    List<StockInstance> findByRecallSlipNoAndProductIdAndStatusForUpdate(
            @Param("recallSlipNo") String recallSlipNo,
            @Param("productId") UUID productId,
            @Param("status") StockInstanceStatus status);

    /**
     * 회수품 재판매 대상 조회(row lock) — recallSlipNo+productCode+RECALLED 후보를 제한 수량만 잠근다.
     *
     * <p>resell-batch 는 회수전표와 품목코드 단위로 advisory lock 을 잡지만, 다른 운영성 전이와의
     * 교차 실행에서 같은 행 중복 전이를 막기 위해 후보 행에도 {@code PESSIMISTIC_WRITE} 를 적용한다.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @param status       대상 상태(RECALLED)
     * @param pageable     잠금 후보 제한(PageRequest.of(0, quantity))
     * @return 재판매 후보 인스턴스 목록(row lock 보유)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.recallSlipNo = :recallSlipNo
              AND s.productCode = :productCode
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.id ASC
            """)
    List<StockInstance> findByRecallSlipNoAndProductCodeAndStatusForUpdate(
            @Param("recallSlipNo") String recallSlipNo,
            @Param("productCode") String productCode,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    /** 모델명 전환 후에도 product UUID로 재판매 대상 legacy product_code 행을 수량만큼 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("""
            SELECT s
            FROM StockInstance s
            WHERE s.recallSlipNo = :recallSlipNo
              AND s.productId = :productId
              AND s.status = :status
              AND s.isDeleted = false
            ORDER BY s.id ASC
            """)
    List<StockInstance> findByRecallSlipNoAndProductIdAndStatusForUpdate(
            @Param("recallSlipNo") String recallSlipNo,
            @Param("productId") UUID productId,
            @Param("status") StockInstanceStatus status,
            Pageable pageable);

    /**
     * S4 회수연동 멱등 수량 확인 — 회수전표 번호 + 품목코드 + 상태 기준 건수.
     *
     * @param recallSlipNo 회수 입고전표 번호
     * @param productCode  품목코드 그룹
     * @param status       대상 상태
     * @return 해당 조건의 인스턴스 수
     */
    long countByRecallSlipNoAndProductCodeAndStatus(
            String recallSlipNo, String productCode, StockInstanceStatus status);

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
