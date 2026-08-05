package com.samhanair.logis.product.service;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** MIG-8 resolver와 시트 soft-delete 사이의 짧은 Product reservation 수명주기. */
@Service
@RequiredArgsConstructor
public class EcountAliasReservationService {

    private static final int RESERVATION_MINUTES = 2;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional
    public Set<UUID> reserve(UUID reservationToken, Collection<UUID> productIds) {
        if (reservationToken == null || productIds == null || productIds.isEmpty()) {
            return Set.of();
        }
        List<UUID> distinct = productIds.stream().filter(id -> id != null).distinct().toList();
        if (distinct.isEmpty()) {
            return Set.of();
        }
        // ProductSheetSyncService 도 같은 행 잠금을 잡은 뒤 reservation 을 검사한다.
        // 따라서 이 잠금보다 먼저 예약한 쪽은 soft-delete 를 보류시키고, 먼저 삭제한
        // 쪽은 아래 active 조회에서 제외되어 resolver 가 오래된 UUID를 반환하지 않는다.
        Set<UUID> activeProductIds = new LinkedHashSet<>(jdbcTemplate.query("""
                SELECT id
                  FROM products
                 WHERE id IN (:productIds)
                   AND is_deleted = FALSE
                 FOR UPDATE
                """, new MapSqlParameterSource("productIds", distinct),
                (rs, rowNum) -> rs.getObject("id", UUID.class)));
        if (activeProductIds.isEmpty()) {
            return Set.of();
        }
        jdbcTemplate.update("""
                INSERT INTO ecount_alias_reservations (reservation_token, product_id, expires_at)
                SELECT :token, p.id, NOW() + (:minutes * INTERVAL '1 minute')
                  FROM products p
                 WHERE p.id IN (:productIds)
                   AND p.is_deleted = FALSE
                ON CONFLICT (reservation_token, product_id) DO UPDATE
                    SET expires_at = EXCLUDED.expires_at
                """, new MapSqlParameterSource()
                .addValue("token", reservationToken)
                .addValue("productIds", activeProductIds)
                .addValue("minutes", RESERVATION_MINUTES));
        return activeProductIds;
    }

    @Transactional
    public boolean hasActiveReservation(UUID productId) {
        if (productId == null) {
            return false;
        }
        // reserve()도 같은 product 행을 잠그므로 check-then-delete 사이의 TOCTOU를
        // 막는다. 삭제가 먼저 잠금을 잡으면 resolver 쪽 reservation 이 생성되지 않는다.
        jdbcTemplate.query("""
                SELECT id
                  FROM products
                 WHERE id = :productId
                 FOR UPDATE
                """, new MapSqlParameterSource("productId", productId),
                (rs, rowNum) -> rs.getObject("id", UUID.class));
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(1)
                  FROM ecount_alias_reservations
                 WHERE product_id = :productId
                   AND expires_at > NOW()
                """, new MapSqlParameterSource("productId", productId), Integer.class);
        return count != null && count > 0;
    }

    @Transactional
    public void release(UUID reservationToken) {
        if (reservationToken == null) {
            return;
        }
        jdbcTemplate.update("""
                DELETE FROM ecount_alias_reservations
                 WHERE reservation_token = :token
                """, new MapSqlParameterSource("token", reservationToken));
    }
}
