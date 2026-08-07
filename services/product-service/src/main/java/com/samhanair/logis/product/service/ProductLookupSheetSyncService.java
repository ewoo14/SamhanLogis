package com.samhanair.logis.product.service;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * RC9 lookup 3종 구글 시트 → DB 동기화 서비스.
 *
 * <p>기존 {@link ProductSheetSyncService} 와 같은 운영 원칙을 따른다. 시트 row 의
 * SHA-256 hash 를 JVM 메모리에 보관해 동일 row 는 update 하지 않고, DB active row 가
 * 시트에서 사라지면 hard delete 없이 {@code BaseEntity.markDeleted()} 로 비활성화한다.
 *
 * <p>대상 탭은 `싱글 자재가격`, `추천실외기`, `분기계산` 3개이며, 시트에 실값이 없는
 * 컬럼은 null 로 보존한다. 특히 HOME_MULTI 추천실외기는 indoorCapacity 를 합성하지
 * 않고 null 로 저장한다.
 */
@Service
public class ProductLookupSheetSyncService {

    private static final Logger log = LoggerFactory.getLogger(ProductLookupSheetSyncService.class);

    /** legacy lookup 시트 ID. ProductMaster sync 와 같은 workbook 을 사용한다. */
    @Value("${google.sheets.sheet-id:1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ}")
    private String sheetId;

    private static final String MATERIAL_TAB = "싱글 자재가격";
    private static final String ODU_TAB = "추천실외기";
    private static final String BRANCH_TAB = "분기계산";
    private static final String SYSTEM_ACTOR = "system-lookup-sheet-sync";
    /**
     * 싱글 자재가격 C/D 사이드블록은 시트 row 2~8 까지만 의미가 있다.
     * 본 루프의 {@code i} 는 원본 rows 기준 0-based 이므로 i=7 이 sheet row 8 이다.
     */
    private static final int MATERIAL_SIDE_BLOCK_LAST_INDEX = 7;

    private final GoogleSheetsClient sheetsClient;
    private final MaterialPriceRepository materialPriceRepository;
    private final OduRecommendationLookupRepository oduRepository;
    private final BranchPipeLookupRepository branchRepository;
    private final ObjectProvider<ProductLookupSheetSyncService> selfProvider;

    /** rowHash 캐시 — natural key → SHA-256. DB 컬럼을 늘리지 않는 기존 sync 패턴을 따른다. */
    private final Map<String, String> lastKnownRowHash = new ConcurrentHashMap<>();

    /**
     * lookup sync service 생성자.
     *
     * @param sheetsClient 구글 시트 client
     * @param materialPriceRepository 자재 단가 repository
     * @param oduRepository 추천실외기 repository
     * @param branchRepository 분기관 repository
     * @param selfProvider 탭별 @Transactional 프록시 호출 provider
     */
    public ProductLookupSheetSyncService(GoogleSheetsClient sheetsClient,
                                         MaterialPriceRepository materialPriceRepository,
                                         OduRecommendationLookupRepository oduRepository,
                                         BranchPipeLookupRepository branchRepository,
                                         ObjectProvider<ProductLookupSheetSyncService> selfProvider) {
        this.sheetsClient = sheetsClient;
        this.materialPriceRepository = materialPriceRepository;
        this.oduRepository = oduRepository;
        this.branchRepository = branchRepository;
        this.selfProvider = selfProvider;
    }

    /**
     * lookup 3탭 전체 sync — scheduler/admin 공용 진입점.
     *
     * <p>각 탭은 프록시를 거쳐 별도 {@code @Transactional} 메서드에서 처리한다.
     * 한 탭 실패는 summary error 로 기록하고 다음 탭 sync 를 계속한다.
     *
     * @return 탭별 sync 결과와 전체 집계
     */
    public SyncSummary syncAll() {
        log.info("[ProductLookupSheetSync] sync 시작: sheetId={}", sheetId);
        Instant started = Instant.now();
        SyncSummary summary = new SyncSummary();
        ProductLookupSheetSyncService self = selfProvider.getIfAvailable(() -> this);

        runTab(summary, MATERIAL_TAB, self::syncMaterialPricesTab);
        runTab(summary, ODU_TAB, self::syncOduRecommendationsTab);
        runTab(summary, BRANCH_TAB, self::syncBranchPipesTab);

        summary.durationMs = Instant.now().toEpochMilli() - started.toEpochMilli();
        log.info("[ProductLookupSheetSync] sync 완료: inserted={}, updated={}, unchanged={}, softDeleted={}, skipped={}, duration={}ms",
                summary.totalInserted, summary.totalUpdated, summary.totalUnchanged,
                summary.totalSoftDeleted, summary.totalSkipped, summary.durationMs);
        return summary;
    }

    /**
     * 싱글 자재가격 탭 sync — A/B 실값과 C/D 사이드블록 값을 row 번호 기준으로 반영한다.
     *
     * @return 탭 sync 결과
     * @throws Exception 시트 read 실패
     */
    @Transactional
    public TabSyncResult syncMaterialPricesTab() throws Exception {
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, MATERIAL_TAB + "!A1:D");
        TabSyncResult result = new TabSyncResult();
        if (rows == null || rows.size() <= 1) {
            log.warn("[ProductLookupSheetSync] tab '{}' 빈 시트 — soft-delete 없이 skip", MATERIAL_TAB);
            return result;
        }

        Set<String> sheetKeys = new HashSet<>();
        for (int i = 1; i < rows.size(); i++) {
            List<String> cells = GoogleSheetsClient.toStringRow(rows.get(i), 4);
            String name = blankToNull(safeGet(cells, 0));
            if (name == null) {
                result.skipped++;
                continue;
            }

            int sheetRowNumber = i + 1;
            String materialKey = "D" + sheetRowNumber;
            sheetKeys.add(materialKey);
            BigDecimal price = parseDecimalOrNull(safeGet(cells, 1));
            if (price == null) {
                result.skipped++;
                recordError(result, "싱글 자재가격 " + materialKey + " 가격 무값/파싱 실패");
                log.warn("[ProductLookupSheetSync] tab '{}' row {} 가격 무값/파싱 실패 — skip",
                        MATERIAL_TAB, sheetRowNumber);
                continue;
            }
            String optionLabel = i <= MATERIAL_SIDE_BLOCK_LAST_INDEX ? blankToNull(safeGet(cells, 2)) : null;
            String computedFormula = i <= MATERIAL_SIDE_BLOCK_LAST_INDEX ? blankToNull(safeGet(cells, 3)) : null;
            String rowHash = sha256(Arrays.asList(materialKey, name, price, optionLabel, computedFormula).toString());
            String cacheKey = "material:" + materialKey;

            Optional<MaterialPrice> active = materialPriceRepository.findByMaterialKey(materialKey);
            if (active.isEmpty()) {
                MaterialPrice row = materialPriceRepository.findAnyByMaterialKeyIncludingDeleted(materialKey)
                        .map(existing -> {
                            existing.markRestored();
                            existing.updateFromSheet(name, price, optionLabel, computedFormula);
                            return existing;
                        })
                        .orElseGet(() -> MaterialPrice.seed(materialKey, name, price, optionLabel, computedFormula));
                materialPriceRepository.save(row);
                lastKnownRowHash.put(cacheKey, rowHash);
                result.inserted++;
            } else if (!Objects.equals(lastKnownRowHash.get(cacheKey), rowHash)) {
                active.get().updateFromSheet(name, price, optionLabel, computedFormula);
                materialPriceRepository.save(active.get());
                lastKnownRowHash.put(cacheKey, rowHash);
                result.updated++;
            } else {
                result.unchanged++;
            }
        }

        return softDeleteMissingMaterials(sheetKeys, result);
    }

    /**
     * 추천실외기 탭 sync — MULTI_HEATING_COOLING 1계열과 HOME_MULTI 2계열을 분리 적재한다.
     *
     * @return 탭 sync 결과
     * @throws Exception 시트 read 실패
     */
    @Transactional
    public TabSyncResult syncOduRecommendationsTab() throws Exception {
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, ODU_TAB + "!A1:E");
        TabSyncResult result = new TabSyncResult();
        if (rows == null || rows.size() <= 2) {
            log.warn("[ProductLookupSheetSync] tab '{}' 빈 시트 — soft-delete 없이 skip", ODU_TAB);
            return result;
        }

        Map<String, OduSheetRow> sheetRows = new LinkedHashMap<>();
        for (int i = 2; i < rows.size(); i++) {
            List<String> cells = GoogleSheetsClient.toStringRow(rows.get(i), 5);
            int sheetRowNumber = i + 1;
            addOduRow(sheetRows, result, RecommendationType.MULTI_HEATING_COOLING,
                    parseDecimalOrNull(safeGet(cells, 0)), null, blankToNull(safeGet(cells, 1)),
                    sheetRowNumber, "A/B");
            addOduRow(sheetRows, result, RecommendationType.HOME_MULTI,
                    null, parseIntegerOrNull(safeGet(cells, 2)), blankToNull(safeGet(cells, 4)),
                    sheetRowNumber, "C/E");
            addOduRow(sheetRows, result, RecommendationType.HOME_MULTI,
                    null, parseIntegerOrNull(safeGet(cells, 3)), blankToNull(safeGet(cells, 4)),
                    sheetRowNumber, "D/E");
        }

        for (OduSheetRow sheetRow : sheetRows.values()) {
            String cacheKey = "odu:" + sheetRow.key();
            String rowHash = sha256(sheetRow.hashPayload());
            Optional<OduRecommendationLookup> active = oduRepository.findActiveByNaturalKey(
                    sheetRow.recommendationType(), sheetRow.indoorCapacity(),
                    sheetRow.indoorCount(), sheetRow.outdoorHp());
            if (active.isEmpty()) {
                OduRecommendationLookup row = oduRepository.findAnyByNaturalKeyIncludingDeleted(
                                sheetRow.recommendationType().name(), sheetRow.indoorCapacity(),
                                sheetRow.indoorCount(), sheetRow.outdoorHp())
                        .map(existing -> {
                            existing.markRestored();
                            existing.updateFromSheet(sheetRow.indoorCapacity(), sheetRow.indoorCount(), sheetRow.outdoorHp());
                            return existing;
                        })
                        .orElseGet(() -> OduRecommendationLookup.seed(sheetRow.recommendationType(),
                                sheetRow.indoorCapacity(), sheetRow.indoorCount(), sheetRow.outdoorHp()));
                oduRepository.save(row);
                lastKnownRowHash.put(cacheKey, rowHash);
                result.inserted++;
            } else if (!Objects.equals(lastKnownRowHash.get(cacheKey), rowHash)) {
                active.get().updateFromSheet(sheetRow.indoorCapacity(), sheetRow.indoorCount(), sheetRow.outdoorHp());
                oduRepository.save(active.get());
                lastKnownRowHash.put(cacheKey, rowHash);
                result.updated++;
            } else {
                result.unchanged++;
            }
        }

        return softDeleteMissingOdu(sheetRows.keySet(), result);
    }

    /**
     * 분기계산 탭 sync — A열 branchCode 만 시드하고 B열 계산값은 저장하지 않는다.
     *
     * @return 탭 sync 결과
     * @throws Exception 시트 read 실패
     */
    @Transactional
    public TabSyncResult syncBranchPipesTab() throws Exception {
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, BRANCH_TAB + "!A1:Z");
        TabSyncResult result = new TabSyncResult();
        if (rows == null || rows.size() <= 1) {
            log.warn("[ProductLookupSheetSync] tab '{}' 빈 시트 — soft-delete 없이 skip", BRANCH_TAB);
            return result;
        }

        Set<String> sheetKeys = new HashSet<>();
        for (int i = 1; i < rows.size(); i++) {
            List<String> cells = GoogleSheetsClient.toStringRow(rows.get(i), 1);
            String branchCode = blankToNull(safeGet(cells, 0));
            if (branchCode == null) {
                result.skipped++;
                continue;
            }
            String rowHash = sha256(Arrays.asList(branchCode, null, null).toString());
            String cacheKey = "branch:" + branchCode;
            sheetKeys.add(branchCode);

            Optional<BranchPipeLookup> active = branchRepository.findByBranchCode(branchCode);
            if (active.isEmpty()) {
                BranchPipeLookup row = branchRepository.findAnyByBranchCodeIncludingDeleted(branchCode)
                        .map(existing -> {
                            existing.markRestored();
                            existing.updateFromSheet(null, null);
                            return existing;
                        })
                        .orElseGet(() -> BranchPipeLookup.seed(branchCode, null, null));
                branchRepository.save(row);
                lastKnownRowHash.put(cacheKey, rowHash);
                result.inserted++;
            } else if (!Objects.equals(lastKnownRowHash.get(cacheKey), rowHash)) {
                active.get().updateFromSheet(null, null);
                branchRepository.save(active.get());
                lastKnownRowHash.put(cacheKey, rowHash);
                result.updated++;
            } else {
                result.unchanged++;
            }
        }

        return softDeleteMissingBranches(sheetKeys, result);
    }

    /**
     * 테스트 전용 hash cache 초기화.
     */
    public void clearHashCacheForTest() {
        lastKnownRowHash.clear();
    }

    /** 탭 실행 wrapper — 실패를 summary 에 기록하고 다음 탭으로 진행한다. */
    private void runTab(SyncSummary summary, String tabName, TabSyncCallable callable) {
        summary.totalTabs++;
        try {
            TabSyncResult result = callable.sync();
            summary.byTab.put(tabName, result);
            summary.totalInserted += result.inserted;
            summary.totalUpdated += result.updated;
            summary.totalUnchanged += result.unchanged;
            summary.totalSoftDeleted += result.softDeleted;
            summary.totalSkipped += result.skipped;
            summary.successfulTabs++;
        } catch (Exception e) {
            invalidateHashCacheForTab(tabName);
            log.error("[ProductLookupSheetSync] tab '{}' sync 실패: {}", tabName, e.getMessage(), e);
            TabSyncResult result = new TabSyncResult();
            result.error = e.getMessage();
            summary.byTab.put(tabName, result);
            summary.failedTabs++;
        }
    }

    /** 자재 시트에서 사라진 active row 를 soft-delete 한다. */
    private TabSyncResult softDeleteMissingMaterials(Set<String> sheetKeys, TabSyncResult result) {
        for (MaterialPrice row : materialPriceRepository.findAll()) {
            if (!sheetKeys.contains(row.getMaterialKey())) {
                row.markDeleted(SYSTEM_ACTOR);
                materialPriceRepository.save(row);
                lastKnownRowHash.remove("material:" + row.getMaterialKey());
                result.softDeleted++;
            }
        }
        return result;
    }

    /** 추천실외기 시트에서 사라진 active row 를 soft-delete 한다. */
    private TabSyncResult softDeleteMissingOdu(Set<String> sheetKeys, TabSyncResult result) {
        for (OduRecommendationLookup row : oduRepository.findAll()) {
            String key = oduKey(row.getRecommendationType(), row.getIndoorCapacity(), row.getIndoorCount(), row.getOutdoorHp());
            if (!sheetKeys.contains(key)) {
                row.markDeleted(SYSTEM_ACTOR);
                oduRepository.save(row);
                lastKnownRowHash.remove("odu:" + key);
                result.softDeleted++;
            }
        }
        return result;
    }

    /** 분기계산 시트에서 사라진 active row 를 soft-delete 한다. */
    private TabSyncResult softDeleteMissingBranches(Set<String> sheetKeys, TabSyncResult result) {
        for (BranchPipeLookup row : branchRepository.findAll()) {
            if (!sheetKeys.contains(row.getBranchCode())) {
                row.markDeleted(SYSTEM_ACTOR);
                branchRepository.save(row);
                lastKnownRowHash.remove("branch:" + row.getBranchCode());
                result.softDeleted++;
            }
        }
        return result;
    }

    /** 추천실외기 후보 row 를 natural key 중복 없이 모은다. */
    private static void addOduRow(Map<String, OduSheetRow> rows, TabSyncResult result,
                                  RecommendationType type, BigDecimal indoorCapacity,
                                  Integer indoorCount, String outdoorHp,
                                  int sheetRowNumber, String sourceColumns) {
        if (outdoorHp == null || (indoorCapacity == null && indoorCount == null)) {
            return;
        }
        OduSheetRow row = new OduSheetRow(type, indoorCapacity, indoorCount, outdoorHp,
                sheetRowNumber, sourceColumns);
        OduSheetRow existing = rows.putIfAbsent(row.key(), row);
        if (existing != null && existing.sheetRowNumber() != sheetRowNumber) {
            result.skipped++;
            String message = "추천실외기 natural key 중복: key=" + row.key()
                    + ", firstRow=" + existing.sheetRowNumber()
                    + ", duplicateRow=" + sheetRowNumber;
            recordError(result, message);
            log.warn("[ProductLookupSheetSync] {}", message);
        }
    }

    /** null 안전 cell getter. */
    private static String safeGet(List<String> cells, int idx) {
        return idx < cells.size() ? cells.get(idx) : "";
    }

    /** blank string 을 null 로 정규화한다. */
    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /** 콤마/통화문자를 제거해 BigDecimal 로 파싱하고 무값/실패 시 null 을 반환한다. */
    private static BigDecimal parseDecimalOrNull(String value) {
        String cleaned = blankToNull(value);
        if (cleaned == null) {
            return null;
        }
        try {
            return new BigDecimal(cleaned.replace(",", "").replace("₩", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 정수 표시값을 파싱하고 무값/실패 시 null 을 반환한다. */
    private static Integer parseIntegerOrNull(String value) {
        String cleaned = blankToNull(value);
        if (cleaned == null) {
            return null;
        }
        try {
            return new BigDecimal(cleaned.replace(",", "").trim()).intValue();
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** SHA-256 row hash 생성. */
    private static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    /** 추천실외기 natural key 문자열 생성. */
    private static String oduKey(RecommendationType type, BigDecimal indoorCapacity,
                                 Integer indoorCount, String outdoorHp) {
        return type + "|" + canonicalDecimal(indoorCapacity) + "|" + indoorCount + "|" + outdoorHp;
    }

    /** ODU NUMERIC scale 차이를 제거한 natural key 용 decimal 문자열. */
    private static String canonicalDecimal(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    /** 탭 트랜잭션 실패 시 rollback 된 rowHash 캐시를 제거한다. */
    private void invalidateHashCacheForTab(String tabName) {
        String prefix = switch (tabName) {
            case MATERIAL_TAB -> "material:";
            case ODU_TAB -> "odu:";
            case BRANCH_TAB -> "branch:";
            default -> null;
        };
        if (prefix == null) {
            return;
        }
        lastKnownRowHash.keySet().removeIf(key -> key.startsWith(prefix));
    }

    /** 탭 결과 error 문자열에 row 단위 사유를 누적한다. */
    private static void recordError(TabSyncResult result, String message) {
        result.error = result.error == null ? message : result.error + "\n" + message;
    }

    /** 탭별 sync callable. */
    @FunctionalInterface
    private interface TabSyncCallable {
        TabSyncResult sync() throws Exception;
    }

    /** 추천실외기 시트 파싱 row. */
    private record OduSheetRow(RecommendationType recommendationType, BigDecimal indoorCapacity,
                               Integer indoorCount, String outdoorHp,
                               int sheetRowNumber, String sourceColumns) {
        /** natural key 문자열. */
        String key() {
            return oduKey(recommendationType, indoorCapacity, indoorCount, outdoorHp);
        }

        /** rowHash payload — DB NUMERIC scale 과 무관하도록 canonical decimal 을 사용한다. */
        String hashPayload() {
            return Arrays.asList(recommendationType, canonicalDecimal(indoorCapacity),
                    indoorCount, outdoorHp).toString();
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

    /** 전체 lookup sync 집계. */
    public static class SyncSummary {
        public Map<String, TabSyncResult> byTab = new HashMap<>();
        public int totalInserted = 0;
        public int totalUpdated = 0;
        public int totalUnchanged = 0;
        public int totalSoftDeleted = 0;
        public int totalSkipped = 0;
        public int totalTabs = 0;
        public int failedTabs = 0;
        public int successfulTabs = 0;
        public long durationMs = 0;
    }
}
