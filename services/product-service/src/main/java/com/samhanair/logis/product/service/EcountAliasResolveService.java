package com.samhanair.logis.product.service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class EcountAliasResolveService {

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final EcountAliasReservationService reservationService;

    @Transactional
    public Map<String, UUID> resolve(List<String> aliasCodes) {
        return resolve(aliasCodes, null);
    }

    @Transactional
    public Map<String, UUID> resolve(List<String> aliasCodes, UUID reservationToken) {
        if (aliasCodes == null || aliasCodes.isEmpty()) {
            return Map.of();
        }
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        for (String aliasCode : aliasCodes) {
            if (aliasCode != null && !aliasCode.isBlank()) {
                distinct.add(aliasCode.trim());
            }
        }
        if (distinct.isEmpty()) {
            return Map.of();
        }

        Map<String, UUID> resolvedAliases = jdbcTemplate.query("""
                SELECT a.alias_code, a.main_product_uuid
                  FROM staging.ecount_item_alias a
                  JOIN products p
                    ON p.id = a.main_product_uuid
                   AND p.is_deleted = FALSE
                 WHERE a.alias_code IN (:codes)
                """, new MapSqlParameterSource("codes", distinct), rs -> {
            Map<String, UUID> resolved = new LinkedHashMap<>();
            while (rs.next()) {
                resolved.put(rs.getString("alias_code"),
                        rs.getObject("main_product_uuid", UUID.class));
            }
            return resolved;
        });
        Set<UUID> reservedProductIds = reservationService.reserve(reservationToken, resolvedAliases.values());
        if (reservationToken != null) {
            resolvedAliases.entrySet().removeIf(entry -> !reservedProductIds.contains(entry.getValue()));
        }
        return resolvedAliases;
    }

}
