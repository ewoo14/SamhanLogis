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

    /** 시더 재기동 시 S2 정리로 삭제된 결정적 견적을 다시 만들지 않도록 삭제행도 조회한다. */
    @Query(value = "SELECT * FROM estimates WHERE estimate_no = :estimateNo LIMIT 1", nativeQuery = true)
    Optional<Estimate> findByEstimateNoIncludingDeleted(@Param("estimateNo") String estimateNo);

    /**
     * soft-deleted row 를 포함해 id 로 조회한다.
     *
     * <p>목록 soft-delete 복원은 {@code @SQLRestriction} 우회 로드가 필요하므로 native query 를 사용한다.
     */
    @Query(value = "SELECT * FROM estimates WHERE id = :id LIMIT 1", nativeQuery = true)
    Optional<Estimate> findByIdIncludingDeleted(@Param("id") UUID id);

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

    /**
     * soft-deleted row 를 포함한 견적 목록 검색.
     *
     * <p>{@code status} 는 enum 의 {@link EstimateStatus#name()} 문자열을 전달해야 한다. native query 에
     * raw enum 을 바인딩하면 ordinal 로 바인딩되어 status 필터가 0건이 되는 회귀가 발생한다.
     */
    @Query(value = """
            SELECT *
              FROM estimates e
             WHERE (:includeDeleted = TRUE OR e.is_deleted = FALSE)
               AND (CAST(:status AS varchar) IS NULL OR e.status = CAST(:status AS varchar))
               AND (CAST(:partnerId AS uuid) IS NULL OR e.partner_id = CAST(:partnerId AS uuid))
               AND (CAST(:startDate AS date) IS NULL OR e.estimate_date >= CAST(:startDate AS date))
               AND (CAST(:endDate AS date) IS NULL OR e.estimate_date <= CAST(:endDate AS date))
             ORDER BY e.is_deleted ASC, e.estimate_date DESC, e.seq_no DESC, e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*)
              FROM estimates e
             WHERE (:includeDeleted = TRUE OR e.is_deleted = FALSE)
               AND (CAST(:status AS varchar) IS NULL OR e.status = CAST(:status AS varchar))
               AND (CAST(:partnerId AS uuid) IS NULL OR e.partner_id = CAST(:partnerId AS uuid))
               AND (CAST(:startDate AS date) IS NULL OR e.estimate_date >= CAST(:startDate AS date))
               AND (CAST(:endDate AS date) IS NULL OR e.estimate_date <= CAST(:endDate AS date))
            """,
            nativeQuery = true)
    Page<Estimate> searchIncludingDeleted(@Param("status") String status,
                                          @Param("partnerId") UUID partnerId,
                                          @Param("startDate") LocalDate startDate,
                                          @Param("endDate") LocalDate endDate,
                                          @Param("includeDeleted") boolean includeDeleted,
                                          Pageable pageable);

    /** 웹 자기 담당 표면 전용 조회. 역할 등급이 아니라 requester_id로만 범위를 고정한다. */
    @Query(value = """
            SELECT *
              FROM estimates e
             WHERE e.requester_id = :requesterId
               AND (:includeDeleted = TRUE OR e.is_deleted = FALSE)
               AND (CAST(:status AS varchar) IS NULL OR e.status = CAST(:status AS varchar))
               AND (CAST(:partnerId AS uuid) IS NULL OR e.partner_id = CAST(:partnerId AS uuid))
               AND (CAST(:startDate AS date) IS NULL OR e.estimate_date >= CAST(:startDate AS date))
               AND (CAST(:endDate AS date) IS NULL OR e.estimate_date <= CAST(:endDate AS date))
             ORDER BY e.is_deleted ASC, e.estimate_date DESC, e.seq_no DESC, e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*)
              FROM estimates e
             WHERE e.requester_id = :requesterId
               AND (:includeDeleted = TRUE OR e.is_deleted = FALSE)
               AND (CAST(:status AS varchar) IS NULL OR e.status = CAST(:status AS varchar))
               AND (CAST(:partnerId AS uuid) IS NULL OR e.partner_id = CAST(:partnerId AS uuid))
               AND (CAST(:startDate AS date) IS NULL OR e.estimate_date >= CAST(:startDate AS date))
               AND (CAST(:endDate AS date) IS NULL OR e.estimate_date <= CAST(:endDate AS date))
            """, nativeQuery = true)
    Page<Estimate> searchAssigned(@Param("requesterId") String requesterId,
                                  @Param("status") String status,
                                  @Param("partnerId") UUID partnerId,
                                  @Param("startDate") LocalDate startDate,
                                  @Param("endDate") LocalDate endDate,
                                  @Param("includeDeleted") boolean includeDeleted,
                                  Pageable pageable);

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
