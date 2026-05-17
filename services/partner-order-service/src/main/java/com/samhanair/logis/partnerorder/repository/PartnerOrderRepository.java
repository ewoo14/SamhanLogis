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
import org.springframework.stereotype.Repository;

/** 거래처 확정 주문 조회 + history. */
@Repository
public interface PartnerOrderRepository extends JpaRepository<PartnerOrder, UUID>,
        JpaSpecificationExecutor<PartnerOrder> {

    /** 거래처 history 페이지 조회 (UUID 미노출 — bizCode 만 사용자 노출). */
    Page<PartnerOrder> findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
            String bizCode, LocalDateTime from, LocalDateTime to, Pageable pageable);

    /** Idempotency-Key 로 기존 주문 조회 (재호출 시 중복 차단). */
    Optional<PartnerOrder> findByIdempotencyKey(String idempotencyKey);

    /** Order-No 중복 검사 (동일 일자 내 최대 sequence 산출용). */
    Optional<PartnerOrder> findByOrderNo(String orderNo);

    /** 업무번호 표준({@code yyyy/MM/dd-N}) 채번 — 같은 날짜의 기존 주문번호를 조회한다. */
    List<PartnerOrder> findAllByOrderNoStartingWith(String orderNoDatePrefix);

    /** Outbox scheduler — PENDING_RETRY 상태 주문 batch (slipNo IS NULL 인 row). */
    List<PartnerOrder> findAllBySlipPublishStatus(SlipPublishStatus status);
}
