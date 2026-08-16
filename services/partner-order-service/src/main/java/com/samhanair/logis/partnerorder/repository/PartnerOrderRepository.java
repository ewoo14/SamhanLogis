package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 거래처 확정 주문 조회 + history. */
@Repository
public interface PartnerOrderRepository extends JpaRepository<PartnerOrder, UUID>,
        JpaSpecificationExecutor<PartnerOrder> {

    /** 장기미발주 판정용 마지막 주문 확정 시각 — auth 사업자번호로 biz_code를 조회한다. */
    @Query("select max(o.confirmedAt) from PartnerOrder o "
            + "where function('replace', o.bizCode, '-', '') = :businessNumber "
            + "and o.confirmedAt is not null")
    LocalDateTime findLastConfirmedAtByBizCode(@Param("businessNumber") String businessNumber);

    /** R16 이전 PARTNER_ORDER legacy snapshot fallback — 사업자번호를 추정하지 않는다. */
    @Query("select max(o.confirmedAt) from PartnerOrder o "
            + "where o.partnerCode = :partnerCode and o.confirmedAt is not null")
    LocalDateTime findLastConfirmedAtByPartnerCode(@Param("partnerCode") String partnerCode);

    /**
     * soft-deleted 주문을 포함해 UUID 로 조회한다.
     *
     * <p>{@link com.samhanair.logis.partnerorder.domain.PartnerOrder} 의 {@code @SQLRestriction("is_deleted = false")} 는
     * JPQL/Criteria 에만 적용되며, 네이티브 쿼리는 이 제약을 우회한다.
     * 삭제된 주문 복원(undelete) 시 사용한다 (설계서 §3.3a — 삭제된 주문도 복원 가능).
     *
     * @param id 주문 UUID
     * @return 활성 + soft-deleted 주문 포함 Optional
     */
    @Query(value = "SELECT * FROM partner_orders WHERE id = :id", nativeQuery = true)
    Optional<PartnerOrder> findByIdIncludingDeleted(@Param("id") UUID id);

    /** 복원 전체를 주문 row 단위로 직렬화한다 (삭제 주문 포함). 락 경합은 즉시 409로 전환한다. */
    @Query(value = "SELECT * FROM partner_orders WHERE id = :id FOR UPDATE NOWAIT", nativeQuery = true)
    Optional<PartnerOrder> findByIdIncludingDeletedForUpdate(@Param("id") UUID id);

    @Query(value = "SELECT * FROM partner_orders WHERE order_no = :orderNo", nativeQuery = true)
    Optional<PartnerOrder> findByOrderNoIncludingDeleted(@Param("orderNo") String orderNo);

    /** 거래처 history 페이지 조회 (UUID 미노출 — bizCode 만 사용자 노출). */
    Page<PartnerOrder> findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
            String bizCode, LocalDateTime from, LocalDateTime to, Pageable pageable);

    /** PARTNER self-service history 조회 — 본인 거래처 코드와 사업자번호를 함께 강제한다. */
    Page<PartnerOrder> findAllByPartnerCodeAndBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
            String partnerCode, String bizCode, LocalDateTime from, LocalDateTime to, Pageable pageable);

    /**
     * 발송내역 전용 조회 — soft-deleted 원본도 발송 기록 행으로 남긴다.
     *
     * <p>native query 로 {@code PartnerOrder.@SQLRestriction}을 우회한다. 이 메서드는 history
     * 경로에서만 사용하며, 일반 주문 목록·집계에는 사용하지 않는다.
     */
    @Query(value = "SELECT * FROM partner_orders "
            + "WHERE biz_code = :bizCode AND confirmed_at BETWEEN :from AND :to "
            + "ORDER BY confirmed_at DESC",
            countQuery = "SELECT COUNT(*) FROM partner_orders "
                    + "WHERE biz_code = :bizCode AND confirmed_at BETWEEN :from AND :to",
            nativeQuery = true)
    Page<PartnerOrder> findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
            @Param("bizCode") String bizCode, @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to, Pageable pageable);

    /** PARTNER 발송내역 전용 조회 — 거래처 범위와 삭제행 보존을 함께 적용한다. */
    @Query(value = "SELECT * FROM partner_orders "
            + "WHERE partner_code = :partnerCode AND biz_code = :bizCode "
            + "AND confirmed_at BETWEEN :from AND :to ORDER BY confirmed_at DESC",
            countQuery = "SELECT COUNT(*) FROM partner_orders "
                    + "WHERE partner_code = :partnerCode AND biz_code = :bizCode "
                    + "AND confirmed_at BETWEEN :from AND :to",
            nativeQuery = true)
    Page<PartnerOrder> findAllHistoryIncludingDeletedByPartnerCodeAndBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
            @Param("partnerCode") String partnerCode, @Param("bizCode") String bizCode,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, Pageable pageable);

    /** PARTNER 가 다른 거래처 사업자번호로 history 조회를 시도했는지 식별한다. */
    boolean existsByBizCodeAndPartnerCodeNot(String bizCode, String partnerCode);

    /** Idempotency-Key 로 기존 주문 조회 (재호출 시 중복 차단). */
    Optional<PartnerOrder> findByIdempotencyKey(String idempotencyKey);

    /** Order-No 중복 검사 (동일 일자 내 최대 sequence 산출용). */
    Optional<PartnerOrder> findByOrderNo(String orderNo);

    /** 견적 -> 주문 변환 중복 차단. */
    Optional<PartnerOrder> findBySourceEstimateId(UUID sourceEstimateId);

    /** 업무번호 표준({@code yyyy/MM/dd-N}) 채번 — 같은 날짜의 기존 주문번호를 조회한다. */
    List<PartnerOrder> findAllByOrderNoStartingWith(String orderNoDatePrefix);

    /** Outbox scheduler — PENDING_RETRY 상태 주문 batch (slipNo IS NULL 인 row). */
    List<PartnerOrder> findAllBySlipPublishStatus(SlipPublishStatus status);
}
