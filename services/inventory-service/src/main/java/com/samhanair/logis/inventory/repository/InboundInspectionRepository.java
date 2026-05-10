package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * InboundInspection 헤더 조회 — slipId 단건 / status 페이지.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가 엔티티 레벨에 적용되어 있으므로
 * 모든 조회는 자동으로 소프트-딜리트 제외된다.
 */
public interface InboundInspectionRepository extends JpaRepository<InboundInspection, UUID> {

    /**
     * slipId 기준 단건 조회 — 입고 슬립 1건당 검수 1건 정책.
     *
     * @param slipId slip-service Slip UUID
     * @return 해당 슬립의 활성 검수 헤더 (없으면 empty)
     */
    Optional<InboundInspection> findBySlipIdAndIsDeletedFalse(UUID slipId);

    /**
     * status 기준 페이지 조회 — 검수 history 목록.
     *
     * @param status 검수 상태 (PENDING / COMPLETED / CANCELED)
     * @param pageable 페이지 정보
     * @return 상태별 검수 헤더 페이지
     */
    Page<InboundInspection> findAllByStatusAndIsDeletedFalse(
            InspectionStatus status, Pageable pageable);

    /**
     * 전체 활성 검수 페이지 조회 — status 필터 없는 목록.
     *
     * @param pageable 페이지 정보
     * @return 활성 검수 헤더 페이지 (created_at DESC 는 Pageable sort 로 지정)
     */
    Page<InboundInspection> findAllByIsDeletedFalse(Pageable pageable);
}
