package com.samhanair.logis.partnerorder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.domain.BootstrapCacheConfig;
import com.samhanair.logis.partnerorder.repository.BootstrapCacheConfigRepository;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 16종 bootstrap prefetch 서비스 (legacy index.html 1230~1244 + Code.js doGet 4~23 대체).
 *
 * <p>{@link Cacheable} 로 in-memory 캐시 — 카탈로그 변경 시 admin endpoint 가 evict.
 * config 키는 DC 9키 ({@code homeDiscount=0.45} 등) 가 제거된 client-safe 사본만 보관 (M3 가드 일관).
 *
 * <p>16 cache key (legacy 와 동일):
 * <pre>
 *   homemulti, singleSets, singleParts, homeDefaults, singleDefaults, singleMatPrices,
 *   commercialMulti, commercialParts, oldProducts,
 *   homeInc, commInc, singleInc, singlePartsInc,
 *   specDetailMap, config, logoData
 * </pre>
 */
@Service
@RequiredArgsConstructor
public class BootstrapService {

    private static final Logger log = LoggerFactory.getLogger(BootstrapService.class);

    /** 16종 cacheKey 목록 (FE 응답 키 순서 보존). */
    public static final List<String> CACHE_KEYS = List.of(
            "homemulti",
            "singleSets",
            "singleParts",
            "homeDefaults",
            "singleDefaults",
            "singleMatPrices",
            "commercialMulti",
            "commercialParts",
            "oldProducts",
            "homeInc",
            "commInc",
            "singleInc",
            "singlePartsInc",
            "specDetailMap",
            "config",
            "logoData");

    /**
     * config 키에서 제거되어야 할 DC 9키 (legacy CFG_RAW). client 응답 노출 금지.
     * M3 가드 일관 — DC 정보는 server-side priceVat 계산용 (M3 dc-config-service 직접 조회).
     */
    public static final Set<String> DC_SECRET_KEYS = Set.of(
            "homeDiscount",
            "commDiscount",
            "singleDiscount",
            "homePartsDiscount",
            "commPartsDiscount",
            "singlePartsDiscount",
            "oldDiscount",
            "incDiscount",
            "specDiscount");

    private final BootstrapCacheConfigRepository cacheRepository;
    private final ObjectMapper objectMapper;

    /**
     * 16종 bootstrap 응답 — 캐시 우선. config 키는 DC 9키 제거 후 응답.
     *
     * @return BootstrapResponse — payloads Map (16개 cacheKey → 객체)
     */
    @Cacheable("bootstrap")
    @Transactional(readOnly = true)
    public BootstrapResponse fetch() {
        Map<String, Object> payloads = new LinkedHashMap<>();
        Map<String, BootstrapCacheConfig> rowsByKey = new HashMap<>();
        cacheRepository.findAllByOrderByCacheKeyAsc()
                .forEach(row -> rowsByKey.put(row.getCacheKey(), row));

        for (String key : CACHE_KEYS) {
            BootstrapCacheConfig row = rowsByKey.get(key);
            if (row == null) {
                // legacy graceful fallback — 빈 객체
                payloads.put(key, "config".equals(key) ? Map.of() : List.of());
                continue;
            }
            Object parsed = parsePayload(row.getPayloadJson());
            if ("config".equals(key) && parsed instanceof Map<?, ?> rawMap) {
                Map<String, Object> safe = new LinkedHashMap<>();
                rawMap.forEach((k, v) -> {
                    if (!(k instanceof String sk)) {
                        return;
                    }
                    if (DC_SECRET_KEYS.contains(sk)) {
                        return;
                    }
                    safe.put(sk, v);
                });
                payloads.put(key, safe);
            } else {
                payloads.put(key, parsed);
            }
        }
        return new BootstrapResponse(payloads);
    }

    /** admin 캐시 갱신 (V2 seed 또는 Sales Form Polish 슬라이스 admin endpoint 후속). */
    @CacheEvict(value = "bootstrap", allEntries = true)
    public void evictAll() {
        log.info("Bootstrap cache evicted");
    }

    private Object parsePayload(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (JsonProcessingException ex) {
            log.error("Bootstrap payload JSON parse failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "bootstrap cache payload 파싱 실패", ex);
        }
    }
}
