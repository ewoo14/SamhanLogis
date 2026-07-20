package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link SlipPublishOutboxRepository}의 claim fragment 구현.
 *
 * <p>Spring Data JPA의 {@code @Modifying} 실행기는 반환형을 정수/void로 제한하므로 파생 쿼리로는
 * {@code RETURNING *} row 를 직접 받을 수 없다. 따라서 claim UPDATE 와 반환 row 조회를 본 fragment 의
 * JDBC query 로 한 짧은 트랜잭션에 묶고, 반환된 PK 로 JPA 엔티티를 재조회한다. {@code CLAIM_SQL}
 * 이 claim SQL 문법의 단일 진실원이다.
 */
@RequiredArgsConstructor
public class SlipPublishOutboxRepositoryImpl implements SlipPublishOutboxRepositoryCustom {

    private static final String CLAIM_SQL = """
            UPDATE slip_publish_outbox
               SET status = 'PROCESSING',
                   last_attempted_at = now(),
                   modified_at = now(),
                   modified_by = 'system'
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
                // claim 직후 hard-delete 등으로 재조회가 null 인 row 는 제외해 processOne(null) NPE 를 방어한다.
                .filter(Objects::nonNull)
                .toList();
    }
}
