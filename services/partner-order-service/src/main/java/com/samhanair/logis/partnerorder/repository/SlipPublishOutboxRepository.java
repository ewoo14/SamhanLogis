package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbox row 조회 + 짧은 원자 claim.
 */
@Repository
public interface SlipPublishOutboxRepository extends JpaRepository<SlipPublishOutbox, UUID>,
        SlipPublishOutboxRepositoryCustom {

    /**
     * 처리 가능한 row 를 worker별로 겹치지 않게 PROCESSING 으로 claim한다.
     *
     * <p>UPDATE 자체만 짧은 트랜잭션으로 끝나며, 반환된 row 를 이용한 HTTP 발행은 이 락과
     * 트랜잭션 밖에서 수행한다. {@code PROCESSING} stale row 도 lease 만료 후 재점유할 수 있다.
     * PostgreSQL {@code RETURNING *} claim SQL 선언은 Spring Data JPA mutation 계약과 함께 보존한다.
     * 실제 row 반환은 동일 repository custom fragment가 수행한다(반환형 List와 @Modifying의
     * Spring Data JPA 제한 때문).
     *
     * @param batch 한 worker가 claim할 최대 row 수
     * @param leaseSeconds PROCESSING lease 만료 기준(초)
     * @return mutation 실행 시 영향 행 수(정상 scheduler 경로에서는 custom fragment 사용)
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE slip_publish_outbox
               SET status = 'PROCESSING',
                   last_attempted_at = now()
             WHERE id IN (
                 SELECT id
                   FROM slip_publish_outbox
                  WHERE is_deleted = false
                    AND (
                        (status = 'PENDING' AND next_attempt_at <= now())
                        OR (
                            status = 'PROCESSING'
                            AND last_attempted_at < now() - make_interval(secs => :leaseSeconds)
                        )
                    )
                  ORDER BY next_attempt_at
                  FOR UPDATE SKIP LOCKED
                  LIMIT :batch
             )
             RETURNING *
            """, nativeQuery = true)
    int claimReadyBatchMutationForJpaContract(@Param("batch") int batch,
                                               @Param("leaseSeconds") int leaseSeconds);

    /** 동일 PartnerOrder 의 outbox row (재발행 시 conflict 방지). */
    boolean existsByPartnerOrderId(UUID partnerOrderId);
}
