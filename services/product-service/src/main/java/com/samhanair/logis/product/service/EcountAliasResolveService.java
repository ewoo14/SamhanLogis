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
        resolveUniqueActiveNames(distinct, resolvedAliases);

        Set<UUID> reservedProductIds = reservationService.reserve(reservationToken, resolvedAliases.values());
        if (reservationToken != null) {
            resolvedAliases.entrySet().removeIf(entry -> !reservedProductIds.contains(entry.getValue()));
        }
        return resolvedAliases;
    }

    /**
     * 회계 라벨이 품목코드가 아니라 활성 Product의 정확한 품목명으로 들어오는 레거시 행을 보완한다.
     * 공백이 있는 요청만 label 후보로 취급하고, 활성 품목명이 유일할 때만 해소한다.
     * 코드처럼 생긴 exact alias 요청은 이 fallback을 타지 않으므로 삭제 alias를 되살리지 않는다.
     */
    private void resolveUniqueActiveNames(Set<String> requestedCodes, Map<String, UUID> resolvedAliases) {
        Set<String> names = requestedCodes.stream()
                .filter(code -> code.chars().anyMatch(Character::isWhitespace))
                .filter(code -> !resolvedAliases.containsKey(code))
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        if (names.isEmpty()) {
            return;
        }
        Map<String, UUID> nameMatches = jdbcTemplate.query("""
                SELECT p.name, p.id
                  FROM products p
                 WHERE p.name IN (:names)
                   AND p.is_deleted = FALSE
                   AND NOT EXISTS (
                       SELECT 1
                         FROM products duplicate
                        WHERE duplicate.name = p.name
                          AND duplicate.is_deleted = FALSE
                          AND duplicate.id <> p.id
                   )
                """, new MapSqlParameterSource("names", names), rs -> {
            Map<String, UUID> result = new LinkedHashMap<>();
            while (rs.next()) {
                result.put(rs.getString("name"), rs.getObject("id", UUID.class));
            }
            return result;
        });
        resolvedAliases.putAll(nameMatches);
    }
}
