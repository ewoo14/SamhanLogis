package com.samhanair.logis.product.service;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 구글 스프레드 시트 → DB 동기화 서비스 (옵션 C-2 cron 1시간 주기).
 *
 * <p><b>출처</b>: 개발책임자 결정 2026-05-05 — 견적서/주문서 품목은 legacy 구글 시트
 * source-of-truth 유지. ProductSeedRunner 의 기존 27 tab → 8 entity 매핑을 그대로
 * 사용하되, dry-run 이 아닌 실 upsert 모드로 운영. legacy 시트 ID 동일.
 *
 * <p><b>동기화 룰</b> (PR #38 매핑 보존):
 * <ul>
 *     <li>홈멀티 → ProductCategory.HOME_MULTI, UsageScope.BOTH</li>
 *     <li>싱글 세트 → SINGLE_SET, BOTH</li>
 *     <li>싱글 구성품 → SINGLE_PART, NONE</li>
 *     <li>상업멀티 → COMMERCIAL_MULTI, BOTH</li>
 *     <li>상업멀티 구성 → COMMERCIAL_PART, NONE</li>
 *     <li>구형 → OLD, BOTH</li>
 * </ul>
 *
 * <p><b>변경 감지</b> — row 의 SHA-256 hash 를 Product.discountFlags + remark prefix 에
 * 저장하지 않고, 메모리 내 비교 (rowHash != stored hash 시만 update). 신규 row =
 * insert. DB 에 있으나 시트에 없는 row = soft delete (deletedAt 설정). 시트 재현 시 복구.
 *
 * <p><b>트랜잭션</b>: 시트 1 tab 씩 별도 트랜잭션 — 1 tab 실패가 전체 sync 무효화 방지.
 * row 단위 실패는 catch + log + skip (sync continuity 우선).
 *
 * <p><b>Layer 4 의미 정렬</b>: 본 service 는 "시트가 진실, DB 는 캐시" 정신.
 * 시트에서 사라진 SKU 는 자동 soft-delete (단종 처리는 별도 ProductStatus enum 직교 운용).
 */
@Service
public class ProductSheetSyncService {

    private static final Logger log = LoggerFactory.getLogger(ProductSheetSyncService.class);

    /** legacy 시트 ID (사용자 결재 변경 X). */
    @Value("${google.sheets.sheet-id:1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ}")
    private String sheetId;

    /** sync 시 default category — V2 시드의 INDOOR_WALL (BaseEntity FK 강제 충족용). */
    private static final String DEFAULT_CATEGORY_CODE = "INDOOR_WALL";

    /** PriceHistory 기준일 — legacy 시드와 동일하게 인상본은 2026-04-01부터 적용한다. */
    private static final LocalDate PRICE_INCREASE_EFFECTIVE_DATE = LocalDate.of(2026, 4, 1);

    /** PriceHistory 기준일 — 인상 전 단가는 충분히 과거 날짜로 보존한다. */
    private static final LocalDate BEFORE_INCREASE_EFFECTIVE_DATE = LocalDate.of(2000, 1, 1);

    /**
     * 시트 → 도메인 매핑 (PR #38 보존).
     *
     * <p>legacy Google Sheet 는 tab 마다 모델/가격 컬럼 위치가 다르다.
     * 특히 싱글 세트/싱글 구성품은 B열이 평형이고 C열이 모델명이라서
     * 홈멀티 기준 B열 모델명 매핑을 재사용하면 실제 모델코드 대신 평형을 저장한다.
     *
     * <p>2026-05-16 개발책임자 정정: 종합견적서 UI/기능은 legacy GAS 1:1 보존.
     * 따라서 ProductMaster 기본 단가는 {@code *_단가인상} tab 이며, base tab 은
     * {@code 인상 전 단가} 선택용 PriceHistory 로만 보존한다.
     */
    private static final List<SheetTabMapping> TAB_MAPPINGS = List.of(
            new SheetTabMapping("홈멀티", "홈멀티_단가인상", "홈멀티", ProductCategory.HOME_MULTI,
                    UsageScope.BOTH, EstimateCategory.HOME_MULTI,
                    0, 1, 3, 5),
            new SheetTabMapping("싱글 세트", "싱글 세트_단가인상", "싱글 세트", ProductCategory.SINGLE_SET,
                    UsageScope.BOTH, EstimateCategory.SINGLE_SET,
                    0, 2, 4, 7),
            new SheetTabMapping("싱글 구성품", "싱글 구성품_단가인상", "싱글 구성품", ProductCategory.SINGLE_PART,
                    UsageScope.NONE, null,
                    0, 2, 5, 7),
            new SheetTabMapping("상업멀티", "상업멀티_단가인상", "상업멀티", ProductCategory.COMMERCIAL_MULTI,
                    UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI,
                    0, 1, 4, 6),
            new SheetTabMapping("상업멀티 구성", "상업멀티 구성_단가인상", "상업멀티 구성", ProductCategory.COMMERCIAL_PART,
                    UsageScope.NONE, null,
                    0, 1, 3, 5),
            new SheetTabMapping("구형", "구형", null, ProductCategory.OLD,
                    UsageScope.BOTH, EstimateCategory.LEGACY,
                    0, 1, 3, 5)
    );

    private final GoogleSheetsClient sheetsClient;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final PriceHistoryRepository priceHistoryRepository;

    /** rowHash 캐시 — JVM 메모리. (시트 row → SHA-256). 다음 sync 시 비교. */
    private final Map<String, String> lastKnownRowHash = new ConcurrentHashMap<>();

    public ProductSheetSyncService(GoogleSheetsClient sheetsClient,
                                   ProductRepository productRepository,
                                   CategoryRepository categoryRepository,
                                   PriceHistoryRepository priceHistoryRepository) {
        this.sheetsClient = sheetsClient;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.priceHistoryRepository = priceHistoryRepository;
    }

    /**
     * 전체 시트 sync — scheduler / admin 양쪽 진입점.
     * tab 별 별도 트랜잭션 (per-tab) — 1 tab 실패가 전체 무효화 방지.
     *
     * @return SyncResult — tab 별 inserted/updated/softDeleted/skipped 집계
     */
    public SyncSummary syncAll() {
        log.info("[ProductSheetSync] sync 시작: sheetId={}", sheetId);
        Instant started = Instant.now();
        SyncSummary summary = new SyncSummary();

        Category defaultCategory = categoryRepository.findByCode(DEFAULT_CATEGORY_CODE)
                .orElse(null);
        if (defaultCategory == null) {
            log.error("[ProductSheetSync] default category {} 미존재 — V2 시드 누락 가능. sync 중단.",
                    DEFAULT_CATEGORY_CODE);
            summary.error = "default category " + DEFAULT_CATEGORY_CODE + " not found";
            return summary;
        }

        for (SheetTabMapping mapping : TAB_MAPPINGS) {
            try {
                TabSyncResult tabResult = syncTab(mapping, defaultCategory);
                summary.byTab.put(mapping.tabName, tabResult);
                summary.totalInserted += tabResult.inserted;
                summary.totalUpdated += tabResult.updated;
                summary.totalSoftDeleted += tabResult.softDeleted;
                summary.totalSkipped += tabResult.skipped;
            } catch (Exception e) {
                log.error("[ProductSheetSync] tab '{}' sync 실패: {}", mapping.tabName, e.getMessage(), e);
                TabSyncResult err = new TabSyncResult();
                err.error = e.getMessage();
                summary.byTab.put(mapping.tabName, err);
            }
        }

        summary.durationMs = Instant.now().toEpochMilli() - started.toEpochMilli();
        log.info("[ProductSheetSync] sync 완료: 총 inserted={}, updated={}, softDeleted={}, skipped={}, duration={}ms",
                summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted,
                summary.totalSkipped, summary.durationMs);
        return summary;
    }

    /**
     * tab 1개 sync — read sheet → upsert 매트릭스. 별도 트랜잭션.
     * row hash 비교: 신규 / 변경 / 동일 / 시트에서 사라진 row 4-way 분기.
     *
     * <p><b>render mode</b> (개발책임자 정정 2026-05-05 — legacy 1:1 보존):
     * legacy estimate Code.js + partner-order Code.js 의 모든 6 tab read 가
     * {@code getDisplayValues()} 사용 (lines 384/507/968/1040/1122/1199 + partner-order 동등).
     * 가격 컬럼이 천단위 콤마/통화 포맷 ({@code "1,500,000"}) 으로 표시되며,
     * legacy {@code parseKRNumber_()} 가 콤마 제거 후 파싱 → 본 service 의
     * {@link #parseDecimal(String)} 도 동일하게 콤마/₩ 제거. 따라서
     * {@link GoogleSheetsClient#readSheetDisplay} ({@code FORMATTED_VALUE}) 사용.
     */
    @Transactional
    public TabSyncResult syncTab(SheetTabMapping mapping, Category defaultCategory) throws Exception {
        TabSyncResult result = new TabSyncResult();
        String range = mapping.currentTabName + "!A1:Z";
        // legacy getDisplayValues() 1:1 — formatted value (천단위 콤마/통화 포함).
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, range);
        if (rows == null || rows.isEmpty()) {
            log.warn("[ProductSheetSync] tab '{}' 빈 시트 — skip", mapping.tabName);
            return result;
        }

        // 헤더 row 자동 탐색 (col0 에 "품" + "명" 포함)
        int headerIdx = findHeaderRow(rows);
        if (headerIdx < 0) {
            log.warn("[ProductSheetSync] tab '{}' 헤더 row 탐색 실패 — skip", mapping.tabName);
            return result;
        }

        // 시트에서 본 row 의 modelCode set (DB 에 있으나 시트에 없는 row 검출용)
        Set<String> sheetModelCodes = new HashSet<>();

        for (int i = headerIdx + 1; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            if (row == null || row.isEmpty()) continue;
            List<String> cells = GoogleSheetsClient.toStringRow(row,
                    Math.max(16, mapping.requiredColumnCount()));

            String name = safeGet(cells, mapping.nameColumn).trim();
            String modelCode = safeGet(cells, mapping.modelCodeColumn).trim();
            if (name.isBlank() || modelCode.isBlank()) {
                result.skipped++;
                continue;
            }
            sheetModelCodes.add(modelCode);

            String rowHash = sha256(cells.subList(0, Math.min(8, cells.size())).toString());
            String prevHash = lastKnownRowHash.get(modelCode);
            BigDecimal releasePrice = parseDecimal(safeGet(cells, mapping.releasePriceColumn));
            BigDecimal deliveryPrice = parseDecimal(safeGet(cells, mapping.deliveryPriceColumn));

            Optional<Product> existing = productRepository.findByModelCodeAndIsDeletedFalse(modelCode);
            if (existing.isEmpty()) {
                Product p = Product.seedFromSheet(name, modelCode, defaultCategory,
                        releasePrice, deliveryPrice,
                        ProductType.SINGLE,
                        mapping.productCategory,
                        mapping.usageScope,
                        mapping.estimateCategory);
                productRepository.save(p);
                upsertPriceHistory(p.getId(), PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                lastKnownRowHash.put(modelCode, rowHash);
                result.inserted++;
            } else if (prevHash == null || !prevHash.equals(rowHash)) {
                Product p = existing.get();
                p.changePrices(releasePrice, deliveryPrice);
                p.changeUsage(mapping.usageScope, mapping.estimateCategory);
                productRepository.save(p);
                upsertPriceHistory(p.getId(), PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                lastKnownRowHash.put(modelCode, rowHash);
                result.updated++;
            } else {
                upsertPriceHistory(existing.get().getId(), PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                result.unchanged++;
            }
        }

        syncBeforeIncreasePriceHistory(mapping, sheetModelCodes);

        // soft-delete: DB 의 같은 productCategory row 중 시트에서 사라진 것
        List<Product> dbProducts = productRepository.findByProductCategoryAndIsDeletedFalse(mapping.productCategory);
        for (Product p : dbProducts) {
            String code = p.getModelCode();
            if (code == null) continue;
            if (!sheetModelCodes.contains(code)) {
                // BaseEntity.markDeleted: deletedAt + deletedBy + isDeleted=true 설정 (shared:common).
                p.markDeleted("system-sheet-sync");
                productRepository.save(p);
                lastKnownRowHash.remove(code);
                result.softDeleted++;
            }
        }

        log.info("[ProductSheetSync] tab '{}': inserted={}, updated={}, unchanged={}, softDeleted={}, skipped={}",
                mapping.tabName, result.inserted, result.updated, result.unchanged,
                result.softDeleted, result.skipped);
        return result;
    }

    private void syncBeforeIncreasePriceHistory(SheetTabMapping mapping, Set<String> currentModelCodes) throws Exception {
        if (mapping.beforeIncreaseTabName == null || currentModelCodes.isEmpty()) {
            return;
        }
        // legacy GAS 기준: base tab 은 current(`*_단가인상`) tab 에 존재하는 모델의
        // "인상 전 단가" history 로만 보존한다. current tab 에 없는 base-only 모델을
        // active ProductMaster 로 되살리는 silent fallback 은 허용하지 않는다.
        String range = mapping.beforeIncreaseTabName + "!A1:Z";
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, range);
        if (rows == null || rows.isEmpty()) {
            return;
        }
        int headerIdx = findHeaderRow(rows);
        if (headerIdx < 0) {
            log.warn("[ProductSheetSync] 인상 전 tab '{}' 헤더 row 탐색 실패 — priceHistory skip",
                    mapping.beforeIncreaseTabName);
            return;
        }
        for (int i = headerIdx + 1; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            if (row == null || row.isEmpty()) continue;
            List<String> cells = GoogleSheetsClient.toStringRow(row,
                    Math.max(16, mapping.requiredColumnCount()));
            String modelCode = safeGet(cells, mapping.modelCodeColumn).trim();
            if (modelCode.isBlank() || !currentModelCodes.contains(modelCode)) {
                continue;
            }
            Optional<Product> product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode);
            if (product.isEmpty()) {
                continue;
            }
            BigDecimal releasePrice = parseDecimal(safeGet(cells, mapping.releasePriceColumn));
            BigDecimal deliveryPrice = parseDecimal(safeGet(cells, mapping.deliveryPriceColumn));
            upsertPriceHistory(product.get().getId(), BEFORE_INCREASE_EFFECTIVE_DATE,
                    releasePrice, deliveryPrice);
        }
    }

    private void upsertPriceHistory(UUID productId, LocalDate effectiveDate,
                                    BigDecimal releasePrice, BigDecimal deliveryPrice) {
        PriceHistory row = priceHistoryRepository
                .findByProductIdAndEffectiveDate(productId, effectiveDate)
                .orElseGet(() -> PriceHistory.seed(productId, effectiveDate,
                        releasePrice, deliveryPrice, null));
        if (row.getId() != null) {
            row.changePrices(releasePrice, deliveryPrice);
        }
        priceHistoryRepository.save(row);
    }

    private int findHeaderRow(List<List<Object>> rows) {
        for (int i = 0; i < Math.min(10, rows.size()); i++) {
            List<Object> r = rows.get(i);
            if (r == null || r.isEmpty()) continue;
            String c0 = r.get(0) == null ? "" : r.get(0).toString();
            if (c0.contains("품") && c0.contains("명")) {
                return i;
            }
        }
        return -1;
    }

    private static String safeGet(List<String> cells, int idx) {
        return idx < cells.size() ? cells.get(idx) : "";
    }

    private static BigDecimal parseDecimal(String s) {
        if (s == null || s.isBlank()) return BigDecimal.ZERO;
        try {
            String cleaned = s.replace(",", "").replace("₩", "").trim();
            return new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 always available on JVM
            return Integer.toHexString(s.hashCode());
        }
    }

    /**
     * 테스트 전용 — 메모리 hash 캐시 초기화.
     * IT 에서 @BeforeEach 로 호출하여 테스트 간 격리 보장. 운영 코드에서 호출 금지.
     */
    public void clearHashCacheForTest() {
        lastKnownRowHash.clear();
    }

    /** 시트 tab → 도메인 매핑 record. */
    public record SheetTabMapping(String tabName,
                                   String currentTabName,
                                   String beforeIncreaseTabName,
                                   ProductCategory productCategory,
                                   UsageScope usageScope,
                                   EstimateCategory estimateCategory,
                                   int nameColumn,
                                   int modelCodeColumn,
                                   int releasePriceColumn,
                                   int deliveryPriceColumn) {
        int requiredColumnCount() {
            return Math.max(
                    Math.max(nameColumn, modelCodeColumn),
                    Math.max(releasePriceColumn, deliveryPriceColumn)
            ) + 1;
        }
    }

    /** tab 1개 sync 결과. */
    public static class TabSyncResult {
        public int inserted = 0;
        public int updated = 0;
        public int unchanged = 0;
        public int softDeleted = 0;
        public int skipped = 0;
        public String error;
    }

    /** 전체 sync 집계. */
    public static class SyncSummary {
        public Map<String, TabSyncResult> byTab = new HashMap<>();
        public int totalInserted = 0;
        public int totalUpdated = 0;
        public int totalSoftDeleted = 0;
        public int totalSkipped = 0;
        public long durationMs = 0;
        public String error;
    }
}
