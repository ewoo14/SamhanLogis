package com.samhanair.logis.partnerorder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.EstimateCatalogClient;
import com.samhanair.logis.partnerorder.client.EstimateCategory;
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient;
import com.samhanair.logis.partnerorder.client.GoogleSheetsClient.ValueRenderMode;
import com.samhanair.logis.partnerorder.client.UsageScope;
import com.samhanair.logis.partnerorder.domain.BootstrapCacheConfig;
import com.samhanair.logis.partnerorder.repository.BootstrapCacheConfigRepository;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import jakarta.annotation.PostConstruct;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 18종 bootstrap prefetch 서비스 (legacy index.html 1230~1244 + Code.js doGet 4~23 대체).
 *
     * <p>개발책임자 확정: bootstrap 원천은 product-service DB와 DB seed이며 Google Sheets는
     * 런타임 원천이 아니다. 기존 시트 설정값은 호환을 위해 남아 있어도 읽지 않는다.
 *
 * <p>{@link Cacheable} 로 in-memory 캐시 — 카탈로그 변경 시 admin endpoint 가 evict.
 * config 키는 DC 9키 ({@code homeDiscount=0.45} 등) 가 제거된 client-safe 사본만 보관 (M3 가드 일관).
 *
 * <p>18 cache key:
 * <pre>
 *   homemulti, singleSets, singleParts, homeDefaults, singleDefaults, singleMatPrices,
 *   commercialMulti, commercialParts, oldProducts,
 *   homeInc, commInc, singleInc, singlePartsInc, commPartsInc,
 *   specDetailMap, config, logoData, priceChangeSchedule
 * </pre>
 *
     * <p>DB 카탈로그 결과가 없을 때만 V2 seed를 fallback으로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class BootstrapService {

    private static final Logger log = LoggerFactory.getLogger(BootstrapService.class);

    /** 18종 cacheKey 목록 (FE 응답 키 순서 보존). */
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
            "commPartsInc",
            "specDetailMap",
            "config",
            "logoData",
            "priceChangeSchedule");

    /** sheet row-list 가 아닌 object/map 계약 키. V2 seed row 부재 fallback 에서 shape 를 보존한다. */
    private static final Set<String> MAP_PAYLOAD_KEYS = Set.of(
            "homeDefaults",
            "singleDefaults",
            "singleMatPrices",
            "homeInc",
            "commInc",
            "singleInc",
            "singlePartsInc",
            "commPartsInc",
            "specDetailMap",
            "config",
            "priceChangeSchedule");

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
    private final GoogleSheetsClient sheetsClient;
    private final EstimateCatalogClient estimateCatalogClient;

    private String bootstrapSheetId;

    /**
     * 시트 prefetch 활성 토글. local profile / 테스트에서 false 로 차단 가능.
     * default true — 운영에서는 부팅 시 자동 prefetch.
     */
    private boolean sheetPrefetchEnabled;

    /**
     * cacheKey → 시트 A1 range 매핑. 매핑 없는 키는 시트 read 생략 후 V2 seed 만 사용.
     * application.yml {@code app.bootstrap.range-map} 으로 override.
     */
    @Value("#{${app.bootstrap.range-map:{:}}}")
    private Map<String, String> rangeMap;

    /** 시트 read 결과 캐시 (key=cacheKey, value=시트 raw payload). 부팅/admin trigger 시 갱신. */
    private final Map<String, Object> sheetCache = new ConcurrentHashMap<>();

    /** product_db 카탈로그 변환 캐시 (key=cacheKey, value=legacy bootstrap shape). */
    private final Map<String, Object> productCatalogCache = new ConcurrentHashMap<>();

    /**
     * 부팅 시 18 cache key prefetch — 시트 read 우선, 실패 시 V2 seed fallback.
     * Service Account JSON 부재 등으로 fail 해도 catch + log (부팅 차단 X).
     */
    @PostConstruct
    public void prefetch() {
        prefetchProductCatalog();
        log.info("[BootstrapService] DB catalog prefetch 완료 — Google Sheets runtime 연동 없음");
    }

    /**
     * 18종 bootstrap 응답 — 시트 prefetch 우선, 부재 시 V2 seed fallback.
     * config 키는 DC 9키 제거 후 응답.
     *
     * @return BootstrapResponse — payloads Map (18개 cacheKey → 객체)
     */
    @Cacheable("bootstrap")
    @Transactional(readOnly = true)
    public BootstrapResponse fetch() {
        Map<String, Object> payloads = new LinkedHashMap<>();
        Map<String, Object> productPayloads = productCatalogCache.isEmpty()
                ? loadProductCatalogPayloadsSafely()
                : new LinkedHashMap<>(productCatalogCache);
        Map<String, BootstrapCacheConfig> rowsByKey = new HashMap<>();
        cacheRepository.findAllByOrderByCacheKeyAsc()
                .forEach(row -> rowsByKey.put(row.getCacheKey(), row));

        for (String key : CACHE_KEYS) {
            // 1) product_db 변환 결과 우선 — order-app 0행 방지.
            if (productPayloads.containsKey(key)) {
                payloads.put(key, applyConfigGuard(key, productPayloads.get(key)));
                continue;
            }
            // 2) V2 seed fallback
            BootstrapCacheConfig row = rowsByKey.get(key);
            if (row == null) {
                // legacy graceful fallback — 빈 객체
                payloads.put(key, defaultPayload(key));
                continue;
            }
            Object parsed = parsePayload(row.getPayloadJson());
            payloads.put(key, applyConfigGuard(key, parsed));
        }
        return new BootstrapResponse(payloads);
    }

    private Object defaultPayload(String key) {
        if (MAP_PAYLOAD_KEYS.contains(key)) {
            return Map.of();
        }
        if ("logoData".equals(key)) {
            return "";
        }
        return List.of();
    }

    /** config 키에 한해 DC 9키 strip — sheet/seed 양쪽 동일 가드. */
    private Object applyConfigGuard(String key, Object payload) {
        if (!"config".equals(key) || !(payload instanceof Map<?, ?> rawMap)) {
            return payload;
        }
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
        return safe;
    }

    /** admin 캐시 갱신 (V2 seed 또는 Sales Form Polish 슬라이스 admin endpoint 후속). */
    @CacheEvict(value = "bootstrap", allEntries = true)
    public void evictAll() {
        sheetCache.clear();
        productCatalogCache.clear();
        log.info("Bootstrap cache evicted (product catalog cache + DB seed + spring cache)");
    }

    /**
     * outer Spring bootstrap 캐시만 비운다.
     *
     * <p>스케줄러가 {@link #prefetch()} 로 내부 {@code productCatalogCache}/{@code sheetCache} 를
     * fresh 상태로 다시 채운 뒤 호출한다. refresh window 중 {@link #fetch()} 가 fallback 응답을
     * {@code @Cacheable("bootstrap")} 에 재캐시했더라도 이 메서드가 마지막에 제거하며, 내부 캐시는
     * 건드리지 않는다.
     */
    @CacheEvict(value = "bootstrap", allEntries = true)
    public void evictSpringBootstrapCache() {
        log.info("Bootstrap spring cache evicted (inner product catalog cache + sheet cache preserved)");
    }

    /** 테스트용 — sheet prefetch 결과 직접 주입 (production 호출 X). */
    void putSheetCacheForTest(String cacheKey, Object payload) {
        sheetCache.put(cacheKey, payload);
    }

    private void prefetchProductCatalog() {
        Map<String, Object> productPayloads = loadProductCatalogPayloadsSafely();
        if (productPayloads.isEmpty()) {
            return;
        }
        productCatalogCache.clear();
        productCatalogCache.putAll(productPayloads);
        log.info("[BootstrapService] product_db catalog prefetch 완료: keys={}", productPayloads.keySet());
    }

    private Map<String, Object> loadProductCatalogPayloadsSafely() {
        try {
            return loadProductCatalogPayloads();
        } catch (Exception ex) {
            log.warn("[BootstrapService] product_db catalog load 실패 (sheet/seed fallback): err={}",
                    ex.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> loadProductCatalogPayloads() {
        List<Map<String, Object>> homemulti = catalogSafely("HOME_MULTI", () ->
                estimateCatalogClient.catalog(EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER));
        List<Map<String, Object>> commercialMulti = catalogSafely("COMMERCIAL_MULTI", () ->
                estimateCatalogClient.catalog(EstimateCategory.COMMERCIAL_MULTI, UsageScope.PARTNER_ORDER));
        List<Map<String, Object>> singleSets = catalogSafely("SINGLE_SET", () ->
                estimateCatalogClient.catalog(EstimateCategory.SINGLE_SET, UsageScope.PARTNER_ORDER));
        List<Map<String, Object>> oldProducts = catalogSafely("LEGACY", () ->
                estimateCatalogClient.catalog(EstimateCategory.LEGACY, UsageScope.PARTNER_ORDER));
        // BE-1 문서화 (#777 item 2) — 구성품(singleParts/commercialParts)은 ProductEstimateExposure
        // 행이 없지만 product-service priceBaseline() 이 exposure 미커버 baseline product 를
        // estimateCategory=null 로 추가 반환한다. 따라서 singlePartsInc/commPartsInc 는 구성품도
        // Model B 자동전환 대상으로 채워진다. oldProducts 는 여전히 baseline 데이터 부재 케이스가
        // 남아 있어 별도 결정/슬라이스 전까지 base(인상 후) fallthrough 를 유지한다.
        List<Map<String, Object>> singleParts = catalogSafely("SINGLE_SET components", () ->
                estimateCatalogClient.components(EstimateCategory.SINGLE_SET));
        List<Map<String, Object>> commercialParts = catalogSafely("COMMERCIAL_MULTI components", () ->
                estimateCatalogClient.components(EstimateCategory.COMMERCIAL_MULTI));
        List<Map<String, Object>> materialPrices = catalogSafely("material prices",
                estimateCatalogClient::materialPrices);
        // BE-2 (#688 S3 R1 리뷰) — priceBaseline/priceChangeSchedule 은 각각 개별 try-catch 로
        // 격리한다. 이 둘을 감싸지 않으면 loadProductCatalogPayloadsSafely() 의 catch-all 이 예외를
        // 여기서 붙잡아, 이미 성공적으로 조회된 위 7개 catalog(homemulti~materialPrices) 까지
        // 통째로 Map.of() 로 폐기된다 — hasProductData 오판 버그(#688)와 동형의 회귀. 따라서 이 두
        // 부가 메타데이터 호출만 개별 실패를 허용하고, 실패해도 빈 fallback 만 잃을 뿐 catalog 7종은
        // 정상 반환한다.
        List<Map<String, Object>> priceBaseline;
        try {
            priceBaseline = nullToEmpty(estimateCatalogClient.priceBaseline());
        } catch (Exception ex) {
            log.warn("[BootstrapService] price-baseline 조회 실패 (catalog 7종은 보존, INC 맵만 영향): err={}",
                    ex.getMessage());
            priceBaseline = List.of();
        }
        Map<String, LocalDate> priceChangeSchedule;
        try {
            priceChangeSchedule = estimateCatalogClient.priceChangeSchedule();
        } catch (Exception ex) {
            log.warn("[BootstrapService] priceChangeSchedule 조회 실패 (catalog 7종은 보존, schedule만 빈 값): err={}",
                    ex.getMessage());
            priceChangeSchedule = Map.of();
        }

        // hasProductData 는 실제 catalog 존재 여부만 판단한다. priceBaseline/priceChangeSchedule 은
        // catalog 와 독립적으로 존재할 수 있는 가격 부가 메타데이터라 이 판정에서 반드시 제외해야
        // 한다 — 포함 시 catalog 가 전부 비어 있어도 (예: schedule 만 선(先)세팅되고 상품 미등록)
        // hasProductData 가 true 로 오판되어, 아래 productPayloads 가 "모든 catalog key = 빈 배열"
        // 로 productCatalogCache 에 캐싱된다. fetch() 는 productPayloads.containsKey(key) 를
        // 시트/V2 seed fallback 보다 우선하므로(정상 catalog 없음 방지 목적) 이 오판이 발생하면
        // 유효한 시트/seed 데이터를 빈 배열로 영구 override — order-app 0행 회귀(#688 S3 정찰 적발).
        boolean hasProductData = Stream.of(homemulti, commercialMulti, singleSets, oldProducts,
                singleParts, commercialParts)
                .anyMatch(rows -> rows != null && !rows.isEmpty());
        if (!hasProductData) {
            return Map.of();
        }

        Map<String, Map<String, Object>> baselineByModel = baselineByModel(priceBaseline);
        Map<String, Object> payloads = new LinkedHashMap<>();
        if (homemulti != null) {
            payloads.put("homemulti", catalogRows(homemulti, CatalogShape.MULTI));
            payloads.put("homeInc", incPriceMap(homemulti, baselineByModel, "modelCode", "releasePrice", "homeInc"));
        }
        if (singleSets != null) {
            payloads.put("singleSets", singleSetRows(singleSets));
            payloads.put("singleInc", incPriceMap(singleSets, baselineByModel,
                    "modelCode", "deliveryPrice", "singleInc"));
        }
        if (singleParts != null) {
            payloads.put("singleParts", componentRows(singleParts, false));
            payloads.put("singlePartsInc", incPriceMap(singleParts, baselineByModel,
                    "componentModelCode", "deliveryPrice", "singlePartsInc"));
        }
        if (materialPrices != null) {
            payloads.put("singleMatPrices", materialPriceMap(materialPrices));
        }
        if (commercialMulti != null) {
            payloads.put("commercialMulti", catalogRows(commercialMulti, CatalogShape.MULTI));
            payloads.put("commInc", incPriceMap(commercialMulti, baselineByModel,
                    "modelCode", "releasePrice", "commInc"));
        }
        if (commercialParts != null) {
            payloads.put("commercialParts", componentRows(commercialParts, true));
            payloads.put("commPartsInc", incPriceMapFirstDecimal(commercialParts, baselineByModel,
                    "componentModelCode", "commPartsInc"));
        }
        if (oldProducts != null) {
            payloads.put("oldProducts", catalogRows(oldProducts, CatalogShape.LEGACY));
        }
        payloads.put("priceChangeSchedule", priceChangeSchedule == null ? Map.of() : priceChangeSchedule);
        return payloads;
    }

    /** 카테고리 단위 product-service 실패를 격리해 성공한 축은 fallback으로 폐기하지 않는다. */
    private <T> T catalogSafely(String axis, Supplier<T> loader) {
        try {
            return loader.get();
        } catch (Exception ex) {
            log.warn("[BootstrapService] product catalog 조회 실패 — category={}, fallback 적용, err={}",
                    axis, ex.getMessage());
            return null;
        }
    }

    private List<Map<String, Object>> catalogRows(List<Map<String, Object>> rows, CatalogShape shape) {
        return rows.stream()
                .map(row -> switch (shape) {
                    case MULTI -> multiRow(row);
                    case LEGACY -> legacyRow(row);
                })
                .toList();
    }

    private Map<String, Object> multiRow(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        String name = str(row.get("name"));
        out.put("name", name);
        out.put("model", row.get("modelCode"));
        out.put("unit", row.get("unit"));
        out.put("price", decimal(row.get("deliveryPrice")));
        out.put("list", decimal(row.get("releasePrice")));
        out.put("useK2", bool(row.get("hasVariableDiscount")));
        out.put("고정DC", decimal(row.get("fixedDiscountRate")));
        out.put("capacity", row.get("capacity"));
        out.put("spec", row.get("specText"));
        out.put("catL", row.get("catL"));
        out.put("catM", row.get("catM"));
        out.put("catS", row.get("catS"));
        out.put("disp", name);
        out.put("note", row.get("remark"));
        return out;
    }

    private List<Map<String, Object>> singleSetRows(List<Map<String, Object>> rows) {
        java.util.concurrent.atomic.AtomicInteger idx = new java.util.concurrent.atomic.AtomicInteger();
        return rows.stream()
                .map(row -> {
                    int rowIndex = idx.getAndIncrement();
                    Map<String, Object> out = new LinkedHashMap<>();
                    String name = str(row.get("name"));
                    Object deliveryPrice = decimal(row.get("deliveryPrice"));
                    out.put("name", name);
                    out.put("model", row.get("modelCode"));
                    out.put("unit", row.get("unit"));
                    out.put("price", deliveryPrice);
                    out.put("priceRaw", deliveryPrice);
                    out.put("priceRight", deliveryPrice);
                    out.put("matKey", row.get("materialKey"));
                    out.put("catL", row.get("catL"));
                    out.put("catM", row.get("catM"));
                    out.put("note", row.get("remark"));
                    out.put("id", name + rowIndex);
                    return out;
                })
                .toList();
    }

    private Map<String, Object> legacyRow(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", row.get("name"));
        out.put("model", row.get("modelCode"));
        out.put("unit", row.get("unit"));
        out.put("price", decimal(row.get("releasePrice")));
        out.put("sheetPrice", decimal(row.get("deliveryPrice")));
        out.put("isDisc", bool(row.get("legacyDiscountFlag")));
        out.put("remarks", row.get("remark"));
        out.put("spec", row.get("specText"));
        return out;
    }

    private List<Map<String, Object>> componentRows(List<Map<String, Object>> rows, boolean commercial) {
        return rows.stream()
                .map(row -> {
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("setModel", row.get("setModelCode"));
                    out.put("model", row.get("componentModelCode"));
                    out.put("name", row.get("name"));
                    out.put("unit", row.get("unit"));
                    Object price = commercial
                            ? firstDecimal(row.get("releasePrice"), row.get("deliveryPrice"))
                            : decimal(row.get("deliveryPrice"));
                    out.put("price", price);
                    out.put("kind", row.get("kind"));
                    out.put("isDefault", bool(row.get("isDefault")));
                    out.put("qty", defaultComponentQty(row));
                    out.put("feat", row.get("variant"));
                    out.put("spec", row.get("specText"));
                    return out;
                })
                .toList();
    }

    private BigDecimal defaultComponentQty(Map<String, Object> row) {
        BigDecimal qty = decimal(row.get("defaultQty"));
        if (qty == null) {
            return BigDecimal.ONE;
        }
        // order-app payload qty는 정수 계약(FE parseInt/regex 소비)이다. BundleExpander 도메인 로직은
        // 소수 defaultQty를 별도 경로로 사용하므로, 여기서는 order-app 페이로드만 정수화한다.
        if (qty.stripTrailingZeros().scale() > 0) {
            log.warn("[BootstrapService] 구성품 defaultQty 소수 감지(order-app 정수화): setModel={}, model={}, defaultQty={}",
                    row.get("setModelCode"), row.get("componentModelCode"), qty);
        }
        return qty.setScale(0, java.math.RoundingMode.HALF_UP);
    }

    private Map<String, Object> materialPriceMap(List<Map<String, Object>> rows) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String name = str(row.get("name"));
            if (name == null || name.isBlank()) {
                continue;
            }
            out.put(name, decimal(row.get("price")));
        }
        return out;
    }

    /** 모델 B: order-app 의 *_INC 맵은 price-baseline(2000-01-01)의 인상 전 단가만 담는다. */
    private Map<String, Object> incPriceMap(
            List<Map<String, Object>> rows,
            Map<String, Map<String, Object>> baselineByModel,
            String modelKey,
            String priceKey,
            String targetKey) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String modelCode = str(row.get(modelKey));
            if (modelCode == null || modelCode.isBlank()) {
                continue;
            }
            Map<String, Object> baseline = baselineByModel.get(modelCode);
            if (baseline == null) {
                log.warn("[BootstrapService] price-baseline 누락으로 {} 제외: model={}", targetKey, modelCode);
                continue;
            }
            BigDecimal price = decimal(baseline.get(priceKey));
            if (price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
                log.warn("[BootstrapService] price-baseline 가격 결측으로 {} 제외: model={}, priceKey={}",
                        targetKey, modelCode, priceKey);
                continue;
            }
            out.put(modelCode, price);
        }
        return out;
    }

    /** 상업 구성품 INC 맵은 componentRows(commercial=true) 와 동일하게 출고가 우선, 납품가 fallback 이다. */
    private Map<String, Object> incPriceMapFirstDecimal(
            List<Map<String, Object>> rows,
            Map<String, Map<String, Object>> baselineByModel,
            String modelKey,
            String targetKey) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String modelCode = str(row.get(modelKey));
            if (modelCode == null || modelCode.isBlank()) {
                continue;
            }
            Map<String, Object> baseline = baselineByModel.get(modelCode);
            if (baseline == null) {
                log.warn("[BootstrapService] price-baseline 누락으로 {} 제외: model={}", targetKey, modelCode);
                continue;
            }
            BigDecimal price = firstDecimal(baseline.get("releasePrice"), baseline.get("deliveryPrice"));
            if (price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
                log.warn("[BootstrapService] price-baseline 가격 결측으로 {} 제외: model={}, priceKey=releasePrice|deliveryPrice",
                        targetKey, modelCode);
                continue;
            }
            out.put(modelCode, price);
        }
        return out;
    }

    private Map<String, Map<String, Object>> baselineByModel(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String modelCode = str(row.get("modelCode"));
            if (modelCode == null || modelCode.isBlank()) {
                continue;
            }
            out.putIfAbsent(modelCode, row);
        }
        return out;
    }

    private List<Map<String, Object>> nullToEmpty(List<Map<String, Object>> rows) {
        return rows == null ? List.of() : rows;
    }

    private BigDecimal firstDecimal(Object first, Object fallback) {
        BigDecimal value = decimal(first);
        return value == null ? decimal(fallback) : value;
    }

    private java.math.BigDecimal decimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof java.math.BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return new java.math.BigDecimal(number.toString());
        }
        String text = value.toString().trim().replace(",", "");
        return text.isBlank() ? null : new java.math.BigDecimal(text);
    }

    private Boolean bool(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return Boolean.parseBoolean(value.toString());
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
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

    private enum CatalogShape {
        MULTI,
        LEGACY
    }
}
