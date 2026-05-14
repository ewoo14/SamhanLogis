package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Slip 헤더 — 단건/필터 페이지 조회. partial unique 는 {@code slip_no} 컬럼에 적용 (V1 SQL).
 *
 * <p>PR-E1 BE-A0 신규: {@link JpaSpecificationExecutor} 추가 — 5 query param (date range / partner_code
 * / driver_phone like / region_group / status) 동적 조합용. 기존 named query 들은 유지 (회귀 가드).
 */
public interface SlipRepository extends JpaRepository<Slip, UUID>, JpaSpecificationExecutor<Slip> {

    /** 전표번호({@code yyyy/MM/dd-NNN}) 단건 조회. soft-delete 제외. */
    Optional<Slip> findBySlipNo(String slipNo);

    /** 상태별 페이지 조회. soft-delete 제외. */
    Page<Slip> findAllByStatusAndIsDeletedFalse(SlipStatus status, Pageable pageable);

    /** slipType 별 페이지 조회. soft-delete 제외. */
    Page<Slip> findAllBySlipTypeAndIsDeletedFalse(SlipType slipType, Pageable pageable);

    /** slipType + status 동시 필터 페이지. soft-delete 제외. */
    Page<Slip> findAllBySlipTypeAndStatusAndIsDeletedFalse(SlipType slipType, SlipStatus status, Pageable pageable);

    /** 활성 전체 페이지. soft-delete 제외. */
    Page<Slip> findAllByIsDeletedFalse(Pageable pageable);

    // ---- Slice B (notification-slice-B) ----

    /**
     * 같은 driverPhone + slipDate 의 슬립 목록 — 자동 그룹화의 source.
     * 미배치 (deliveryBatchId IS NULL) 슬립만 반환할지 여부는 호출자 (DeliveryBatchService) 결정.
     */
    List<Slip> findAllByDriverPhoneAndSlipDateAndIsDeletedFalse(String driverPhone, LocalDate slipDate);

    /**
     * 특정 배송일에 driverPhone 이 채워진 모든 슬립 — 자동 그룹화 candidate set.
     * 같은 phone 끼리 묶어 batch 1건씩 생성. 호출자에서 phone 별 group by 후 처리.
     */
    List<Slip> findAllBySlipDateAndDriverPhoneIsNotNullAndIsDeletedFalse(LocalDate slipDate);

    /** 특정 배치에 속한 슬립 목록 — 배치 상세 화면 / 공개 모바일 페이지 source. */
    List<Slip> findAllByDeliveryBatchIdAndIsDeletedFalse(UUID deliveryBatchId);

    // ---- Slice C (signature-slice-C) ----

    /**
     * signatureShareToken 단건 조회 — 인수자 view 공개 endpoint source.
     * partial UNIQUE INDEX (V5) 로 token 발급된 슬립만 유일성 보장.
     */
    Optional<Slip> findBySignatureShareTokenAndIsDeletedFalse(String signatureShareToken);

    // ---- Phase 6 M5 (slip-service-integration) — 발행 출처 + idempotency 조회 ----

    /**
     * idempotencyKey 단건 조회 — Sync REST 발행 endpoint 의 1단계 가드.
     * partial UNIQUE INDEX (V7) 로 token 발급된 슬립만 유일성 보장.
     * 같은 키 + 같은 본문 → 200 (기존 slipNo). 같은 키 + 다른 본문 → 409 Conflict.
     */
    Optional<Slip> findByIdempotencyKeyAndIsDeletedFalse(String idempotencyKey);

    /**
     * 발행 출처 기준 조회 — {@code GET /api/v1/slips/by-source} endpoint source.
     * 같은 estimateNumber/partnerOrderId 의 슬립 목록 (정상적으로는 1건, 재시도 충돌 시 0건 또는 1건).
     */
    List<Slip> findAllBySourceTypeAndSourceIdAndIsDeletedFalse(
            SlipSourceType sourceType, String sourceId);

    // ---- Phase 10 W10-4 (PR #99) — partnerId 기반 최근 활성 슬립 lookup ----

    /**
     * 특정 partnerId 의 활성 슬립 중 최근 슬립 페이지 조회 — 어플 driver-app 정차 완료 시
     * arologis-service 가 partnerCode → partnerId resolve 후 본 메서드로 slipId 매핑.
     *
     * <p>order by slipDate DESC, seqNo DESC — 같은 날짜 내 마지막 슬립 우선. status 필터 없이
     * soft-delete 만 제외 (운영 정책상 어떤 단계의 슬립이든 매핑 가능 — 실제 가드는 service 레이어
     * SIGNABLE_STATUSES 에서).
     */
    org.springframework.data.domain.Page<Slip> findAllByPartnerIdAndIsDeletedFalseOrderBySlipDateDescSeqNoDesc(
            UUID partnerId, org.springframework.data.domain.Pageable pageable);

    // ---- P1-8 (Stage 4) — accounting-service lock-by-period 의존 ----

    /**
     * 기간 + 상태 + lock_flag 조합 조회 — POST /slips/lock-by-period 의 source.
     * accounting-service 가 마감 기간 CONFIRMED 슬립을 일괄 lock 처리할 때 본 메서드로 lookup.
     *
     * @param startDate 기간 시작일 (포함)
     * @param endDate 기간 종료일 (포함)
     * @param status 대상 상태 (일반적으로 CONFIRMED)
     * @return 기간 내 해당 status + lock_flag=false 슬립 (이미 lock 된 슬립은 idempotent 제외)
     */
    List<Slip> findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
            java.time.LocalDate startDate, java.time.LocalDate endDate,
            SlipStatus status);

    // ---- PR-E1 BE-A5/A6 — 다음날자 이미지 / 정리 리스트 ----

    /**
     * 특정 slipDate 의 활성 슬립 전체 — BE-A5 next-day-image-data 의 source.
     * partner_code / region 정렬 + 그룹핑은 service 레이어 책임.
     *
     * @param slipDate 조회 대상 날짜 (legacy GAS "내일자" = 호출자가 today+1 로 지정)
     * @return slipDate 일치 + 활성 (출고/입고 모두 포함, FE 가 slipType 분기)
     */
    List<Slip> findAllBySlipDateAndIsDeletedFalse(java.time.LocalDate slipDate);

    /**
     * 기간 + 활성 슬립 — BE-A6 cleanup 리스트의 source. status 필터는 service 레이어에서 추가.
     *
     * @param startDate 기간 시작 (포함)
     * @param endDate 기간 종료 (포함)
     * @return 기간 내 활성 슬립 전체 (정리/검증 flag 계산은 service 가 수행)
     */
    List<Slip> findAllBySlipDateBetweenAndIsDeletedFalse(
            java.time.LocalDate startDate, java.time.LocalDate endDate);

    // ---- Samhan Public 배차 메뉴 Phase A (BE Task B7) — 미배차 출고전표 페이지네이션 ----

    /**
     * 배차 메뉴 미배차 출고전표 페이지네이션 — 50/회 default.
     *
     * <p>필터:
     * <ul>
     *   <li>slipType = SHIPPING (출고 전표만)</li>
     *   <li>slipDate ∈ [from, to] (default = Asia/Seoul today ± 1일)</li>
     *   <li>dispatchStatus ∈ statuses (default = UNDISPATCHED)</li>
     *   <li>is_deleted = false</li>
     * </ul>
     *
     * <p>정렬은 호출자 {@link Pageable} 에서 지정 (slipDate desc + seqNo desc 권장).
     */
    Page<Slip> findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
            SlipType slipType,
            java.time.LocalDate from,
            java.time.LocalDate to,
            java.util.Collection<com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus> statuses,
            Pageable pageable);
}
