package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbox row 조회 + 짧은 원자 claim.
 *
 * <p>정상 claim(PENDING/stale PROCESSING → PROCESSING)은 {@link SlipPublishOutboxRepositoryCustom}
 * 의 네이티브 {@code UPDATE ... RETURNING}(FOR UPDATE SKIP LOCKED)이 담당한다. 본 인터페이스는
 * 결과 tx 의 소유권 재검증용 비관 락 조회만 추가로 노출한다.
 */
@Repository
public interface SlipPublishOutboxRepository extends JpaRepository<SlipPublishOutbox, UUID>,
        SlipPublishOutboxRepositoryCustom {

    /**
     * PENDING + PROCESSING 상태의 soft-delete 제외 outbox 건수. Prometheus pull 시 실행한다.
     *
     * <p>#863 R1 MED — Micrometer 게이지 콜백은 scrape 요청을 처리하는 Tomcat worker 스레드에서
     * 인라인 실행되므로, DB/커넥션 풀 압박 시 이 쿼리가 scrape 자체를 지연시켜 인스턴스 전체
     * metric 이 함께 유실될 수 있다. {@code readOnly=true} 로 불필요한 dirty-checking/flush 를
     * 피하고, {@code jakarta.persistence.query.timeout}(ms) 로 쿼리 실행 자체의 상한을 건다 — 커넥션
     * 획득 대기(Hikari {@code connectionTimeout})는 이 hint 로 막을 수 없으므로 여전히 상한이 아니다.
     */
    @Transactional(readOnly = true)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "3000"))
    @Query(value = """
            SELECT COUNT(*)
              FROM slip_publish_outbox
             WHERE is_deleted = FALSE
               AND status IN ('PENDING', 'PROCESSING')
            """, nativeQuery = true)
    long countPendingDepth();

    /**
     * 가장 오래된 미처리 outbox의 경과 초. 미처리 행이 없으면 0을 반환한다.
     *
     * <p>#863 R1 MED — {@link #countPendingDepth()} 와 동일한 이유로 readOnly + 쿼리 timeout(3초)을
     * 명시한다.
     */
    @Transactional(readOnly = true)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "3000"))
    @Query(value = """
            SELECT COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(first_attempted_at))), 0)
              FROM slip_publish_outbox
             WHERE is_deleted = FALSE
               AND status IN ('PENDING', 'PROCESSING')
            """, nativeQuery = true)
    double oldestPendingAgeSeconds();

    /**
     * 결과 tx 소유권 가드용 비관적 쓰기 락 조회.
     *
     * <p>결과 writer(commitSuccess/handleRetry/requeueAfterResultFailure)가 row 를
     * {@code SELECT ... FOR UPDATE} 로 잠근 뒤 현재 상태가 PROCESSING 인지 재검한다. lease 만료로
     * 동일 row 를 두 worker 가 겹쳐 처리(A=성공→COMMITTED, B=stale 실패→PENDING)하더라도 per-row
     * 직렬화로 먼저 락을 획득한 전이만 적용되고, 뒤늦은 전이는 non-PROCESSING 을 보고 skip 되어
     * COMMITTED 가 PENDING 으로 덮이는 clobber 를 원천 차단한다. 단일 row(PK) 락이라 데드락은 없다.
     *
     * <p>락은 호출 tx 종료까지만 유지되며, HTTP 발행은 tx 밖(processor)에서 수행하므로 락을 물지 않는다.
     *
     * <p>⚠️ <b>대기 상한은 {@code @QueryHints}/{@code jakarta.persistence.lock.timeout} 으로 걸리지 않는다</b>
     * (#854 R4 MED). Hibernate {@code PostgreSQLDialect.supportsWait()} 이 false 라 양수 timeout 은 무시되고
     * ({@code for update} 문자열 그대로), PostgreSQL 기본 {@code lock_timeout} 도 0(무한)이다. 따라서 상한은
     * 호출 측 {@code @Transactional(timeout = ...)}(→ JDBC statement timeout → pgjdbc cancel)으로만 실효화되며,
     * {@link com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxResultWriter} 가 이를 부여한다.
     *
     * @param id outbox row PK
     * @return PROCESSING 여부 재검 대상 row (없으면 empty)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from SlipPublishOutbox o where o.id = :id")
    Optional<SlipPublishOutbox> findWithLockById(@Param("id") UUID id);
}
