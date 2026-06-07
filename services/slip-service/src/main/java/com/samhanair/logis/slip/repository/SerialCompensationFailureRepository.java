package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 원격 재고 보상 실패 감사 저장소.
 */
public interface SerialCompensationFailureRepository
        extends JpaRepository<SerialCompensationFailure, UUID> {

    /**
     * 해소 여부별 보상 실패 감사 행을 최신 생성 순으로 조회한다.
     *
     * @param resolved 해소 여부
     * @param pageable 페이지 요청
     * @return 생성시각 내림차순 보상 실패 page
     */
    Page<SerialCompensationFailure> findByResolvedOrderByCreatedAtDesc(
            boolean resolved,
            Pageable pageable);

    /**
     * 보존기간이 지난 해소 완료 감사 행을 조회한다.
     *
     * <p>{@code @SQLRestriction("is_deleted = false")} 로 이미 정리된 행은 재조회되지 않아
     * retention 작업이 멱등으로 동작한다.
     *
     * @param cutoff 보존기간 기준 시각. 이 시각보다 오래된 행만 후보
     * @return 정리 후보 감사 행 목록
     */
    List<SerialCompensationFailure> findByResolvedTrueAndCreatedAtBefore(
            LocalDateTime cutoff);

    /**
     * soft-delete 후 grace 경과 행만 물리 삭제한다.
     *
     * <p>{@code is_deleted=TRUE} 조건이 미해소/활성 행 불가침을 보증한다.
     * {@code @SQLRestriction} 은 native 미적용이라 의도적 우회한다.
     *
     * @param cutoff 물리 삭제 기준 시각. {@code deleted_at} 이 이 시각보다 오래된 행만 삭제
     * @param batchSize 단일 cron 발화에서 삭제할 최대 행 수
     * @return 물리 삭제 건수
     */
    @Modifying
    @Query(value = """
            DELETE FROM serial_compensation_failures
             WHERE id IN (
                SELECT id
                  FROM serial_compensation_failures
                 WHERE is_deleted = TRUE
                   AND deleted_at < :cutoff
                 LIMIT :batchSize
             )
            """, nativeQuery = true)
    int deleteSoftDeletedBefore(
            @Param("cutoff") LocalDateTime cutoff,
            @Param("batchSize") int batchSize);

    /**
     * 자동 재시도 후보를 조회한다. (D-SER-27)
     *
     * <p>미해소(resolved=false) AND 재시도 한도 미만(retry_count &lt; maxRetries) AND
     * 백오프 경과(next_retry_at 이 NULL 이거나 now 이하) 인 행만 후보. {@code @SQLRestriction("is_deleted=false")}
     * 로 정리된 행은 제외된다. 오래된 실패부터 재시도하도록 occurred_at 오름차순.
     *
     * @param maxRetries 재시도 상한(이 값 이상이면 자동 재시도 중단, 수동 정합 대상 유지)
     * @param now 현재 시각(백오프 비교 기준)
     * @return 재시도 후보 목록(occurred_at ASC)
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT f FROM SerialCompensationFailure f
             WHERE f.resolved = false
               AND f.retryCount < :maxRetries
               AND (f.nextRetryAt IS NULL OR f.nextRetryAt <= :now)
             ORDER BY f.occurredAt ASC
            """)
    List<SerialCompensationFailure> findRetryCandidates(int maxRetries, LocalDateTime now);

    /**
     * 재시도 1건을 행 락(PESSIMISTIC_WRITE)으로 조회한다. (D-SER-27)
     *
     * <p>재시도 실행기가 REQUIRES_NEW 트랜잭션에서 호출해 동일 행의 동시 재시도(다중 인스턴스/중복 발화)를
     * 직렬화한다 — 같은 보상 행에 대한 retry_count 이중 증가를 방지한다.
     *
     * @param id 감사 행 id
     * @return 행 락을 획득한 엔티티(없으면 empty)
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT f FROM SerialCompensationFailure f WHERE f.id = :id")
    java.util.Optional<SerialCompensationFailure> findByIdForUpdate(UUID id);
}
