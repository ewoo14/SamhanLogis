package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link SlipPublishOutboxRepository}의 claim fragment 구현.
 *
 * <p>Spring Data JPA의 {@code @Modifying} 실행기는 반환형을 정수/void로 제한한다. 스펙의
 * {@code @Modifying @Query} SQL 선언은 repository 계약·문서·정적 게이트로 유지하고, 실제
 * {@code RETURNING *} 결과는 같은 트랜잭션의 JDBC query로 받아 JPA 엔티티를 재조회한다.
 */
@RequiredArgsConstructor
public class SlipPublishOutboxRepositoryImpl implements SlipPublishOutboxRepositoryCustom {

    private static final String CLAIM_SQL = """
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
                            AND last_attempted_at < now() - make_interval(secs => CAST(? AS double precision))
                        )
                    )
                  ORDER BY next_attempt_at
                  FOR UPDATE SKIP LOCKED
                  LIMIT ?
             )
             RETURNING *
            """;

    private final JdbcTemplate jdbcTemplate;
    private final EntityManager entityManager;

    /** claim UPDATE와 반환 row 조회를 한 짧은 트랜잭션으로 묶는다. */
    @Override
    @Transactional
    public List<SlipPublishOutbox> claimReadyBatch(int batch, int leaseSeconds) {
        List<UUID> ids = jdbcTemplate.query(
                CLAIM_SQL,
                (rs, rowNum) -> (UUID) rs.getObject("id"),
                leaseSeconds,
                batch);
        return ids.stream()
                .map(id -> entityManager.find(SlipPublishOutbox.class, id))
                .toList();
    }
}
