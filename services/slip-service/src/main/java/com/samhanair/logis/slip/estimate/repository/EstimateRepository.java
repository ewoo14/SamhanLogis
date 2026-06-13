package com.samhanair.logis.slip.estimate.repository;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 견적서 헤더 — 단건 / 필터 페이지 조회. partial UNIQUE INDEX 는 V13 SQL 의
 * {@code estimate_no WHERE is_deleted=false} 에 적용.
 */
public interface EstimateRepository extends JpaRepository<Estimate, UUID> {

    /** 견적번호 단건 조회. soft-delete 제외. */
    Optional<Estimate> findByEstimateNo(String estimateNo);

    /**
     * 협업 overlay 적용용 조회.
     *
     * <p>라인 메모만 변경되는 경우 자식 {@code estimate_lines} 만 dirty 가 되어 부모 {@code Estimate}
     * {@code @Version} 충돌이 빠질 수 있으므로, 부모 버전을 강제 증가시켜 동시 수정 손실을 방지한다.
     *
     * <p><b>주의</b>: {@code left join fetch e.lines} 를 함께 쓰면 lock 모드가 fetch 된
     * {@code EstimateLine}(버전 없음)에도 적용되어 fresh 세션에서
     * {@code OPTIMISTIC_FORCE_INCREMENT not supported for non-versioned entities} 가 발생한다
     * (동일 트랜잭션 IT 의 1-차 캐시가 이를 가려 false-green). 따라서 부모 {@code Estimate} 만 잠그고
     * 라인은 트랜잭션 내 lazy 로드로 처리한다.
     */
    @Lock(LockModeType.OPTIMISTIC_FORCE_INCREMENT)
    @Query("select e from Estimate e where e.id = :id")
    Optional<Estimate> findByIdForCollabOverlay(@Param("id") UUID id);

    /** 활성 전체 페이지. */
    Page<Estimate> findAllByIsDeletedFalse(Pageable pageable);

    /** 상태별 페이지. */
    Page<Estimate> findAllByStatusAndIsDeletedFalse(EstimateStatus status, Pageable pageable);

    /** 거래처별 페이지. */
    Page<Estimate> findAllByPartnerIdAndIsDeletedFalse(UUID partnerId, Pageable pageable);

    /** 상태 + 거래처 동시 필터. */
    Page<Estimate> findAllByStatusAndPartnerIdAndIsDeletedFalse(
            EstimateStatus status, UUID partnerId, Pageable pageable);

    /** 기간 필터 (estimate_date BETWEEN). */
    Page<Estimate> findAllByEstimateDateBetweenAndIsDeletedFalse(
            LocalDate startDate, LocalDate endDate, Pageable pageable);

    /** 상태 + 기간 동시 필터. */
    Page<Estimate> findAllByStatusAndEstimateDateBetweenAndIsDeletedFalse(
            EstimateStatus status, LocalDate startDate, LocalDate endDate, Pageable pageable);
}
