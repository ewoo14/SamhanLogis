package com.samhanair.logis.partnerorder.vendor.client;

import com.samhanair.logis.partnerorder.client.GoogleSheetsClient;
import java.io.IOException;
import java.math.BigDecimal;
import java.security.GeneralSecurityException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 종합견적서/주문서 Google Sheet 원본 tab 기반 modelCode → 단가 lookup.
 *
 * <p>사용자 명시 (memory project_arologis_phase10): legacy GAS 의 Notion 단가 마스터를 폐기하고
 * 우리 자체 종합견적서 시트로 일원화. 단, {@code 종합견적서} tab 자체는 출력 양식이므로
 * legacy GAS 와 동일하게 홈멀티/싱글/상업멀티 원본 tab 을 직접 읽는다.
 *
 * <p>fail-soft: 시트 read 실패 / 매칭 없음 시 empty 반환.
 *
 * <p>본 client 는 IT 에서 {@code @MockBean} 격리 의무.
 */
public class ProductCatalogLookupClient {

    private static final Logger log = LoggerFactory.getLogger(ProductCatalogLookupClient.class);

    private final GoogleSheetsClient sheetsClient;

    private static final List<CatalogTab> LEGACY_SOURCE_TABS = List.of(
            // 주문서 경로는 개발책임자 정정에 따라 *_단가인상 tab 만 사용한다.
            new CatalogTab("홈멀티_단가인상!A1:Z", 0, 1, 3, 5),
            new CatalogTab("싱글 세트_단가인상!A1:Z", 0, 2, 4, 7),
            new CatalogTab("싱글 구성품_단가인상!A1:Z", 0, 2, 5, 7),
            new CatalogTab("상업멀티_단가인상!A1:Z", 0, 1, 4, 6),
            new CatalogTab("상업멀티 구성_단가인상!A1:Z", 0, 1, 3, 5),
            new CatalogTab("구형!A1:Z", 0, 1, 3, 5)
    );

    /** 종합견적서 시트 ID — 운영에서는 INTEGRATED_QUOTE_SHEET_ID 환경변수 override. */
    private String catalogSheetId;

    /**
     * 선택 override: 외부에서 이미 modelCode/productName/unitPrice 3열 flat range 를 만든 경우만 사용.
     * 비어 있으면 legacy GAS 원본 tab 매핑을 사용한다.
     */
    private String catalogRangeOverride;

    public ProductCatalogLookupClient(GoogleSheetsClient sheetsClient) {
        this.sheetsClient = sheetsClient;
    }

    /**
     * modelCode → CatalogEntry lookup. Caffeine 5분 TTL (GoogleSheetsClient 내부) 캐시 활용.
     *
     * @param modelCode 모델코드 (필수)
     * @return CatalogEntry (성공) / empty (시트 read 실패 / 미매칭)
     */
    public Optional<CatalogEntry> findByModelCode(String modelCode) {
        if (modelCode == null || modelCode.isBlank()) {
            return Optional.empty();
        }
        Map<String, CatalogEntry> all = loadCatalog();
        return Optional.ofNullable(all.get(modelCode.trim()));
    }

    /** 다건 lookup — controller 가 한번에 여러 라인 처리할 때 호출 (시트 read 1회만). */
    public Map<String, CatalogEntry> findByModelCodes(List<String> modelCodes) {
        if (modelCodes == null || modelCodes.isEmpty()) {
            return Map.of();
        }
        Map<String, CatalogEntry> all = loadCatalog();
        Map<String, CatalogEntry> result = new LinkedHashMap<>();
        for (String code : modelCodes) {
            if (code == null || code.isBlank()) {
                continue;
            }
            CatalogEntry e = all.get(code.trim());
            if (e != null) {
                result.put(code.trim(), e);
            }
        }
        return result;
    }

    /** Google Sheet 원본 tab 전체 → modelCode 인덱스. fail-soft (read 실패 시 빈 map). */
    private Map<String, CatalogEntry> loadCatalog() {
        if (catalogRangeOverride != null && !catalogRangeOverride.isBlank()) {
            return loadFlatCatalog(catalogRangeOverride.trim());
        }
        Map<String, CatalogEntry> map = new LinkedHashMap<>();
        for (CatalogTab tab : LEGACY_SOURCE_TABS) {
            try {
                List<List<Object>> rows = sheetsClient.readSheetDisplay(catalogSheetId, tab.range());
                int headerIdx = findHeaderRow(rows);
                if (headerIdx < 0) {
                    log.warn("ProductCatalogLookupClient — header not found: {}", tab.range());
                    continue;
                }
                for (int i = headerIdx + 1; i < rows.size(); i++) {
                    List<String> cells = GoogleSheetsClient.toStringRow(
                            rows.get(i), Math.max(16, tab.requiredColumnCount()));
                    String modelCode = safeGet(cells, tab.modelCodeColumn()).trim();
                    if (modelCode.isBlank()) {
                        continue;
                    }
                    String productName = safeGet(cells, tab.nameColumn()).trim();
                    BigDecimal releasePrice = parsePrice(safeGet(cells, tab.releasePriceColumn()));
                    BigDecimal unitPrice = parsePrice(safeGet(cells, tab.unitPriceColumn()));
                    map.putIfAbsent(modelCode, new CatalogEntry(modelCode, productName,
                            releasePrice, unitPrice));
                }
            } catch (IOException | GeneralSecurityException ex) {
                log.warn("ProductCatalogLookupClient — sheet read fail-soft: range={}, error={}",
                        tab.range(), ex.getMessage());
            } catch (RuntimeException ex) {
                log.warn("ProductCatalogLookupClient — 예상치 못한 오류 fail-soft: range={}, error={}",
                        tab.range(), ex.getMessage());
            }
        }
        return map;
    }

    /** 운영자가 별도 flat range 를 지정한 경우의 legacy 호환 loader. */
    private Map<String, CatalogEntry> loadFlatCatalog(String flatRange) {
        try {
            List<List<Object>> rows = sheetsClient.readSheetDisplay(catalogSheetId, flatRange);
            Map<String, CatalogEntry> map = new LinkedHashMap<>();
            for (List<Object> row : rows) {
                List<String> cells = GoogleSheetsClient.toStringRow(row, 3);
                String modelCode = safeGet(cells, 0).trim();
                if (modelCode.isEmpty() || modelCode.contains("모델")) {
                    continue;
                }
                String productName = safeGet(cells, 1).trim();
                BigDecimal unitPrice = parsePrice(safeGet(cells, 2));
                map.put(modelCode, new CatalogEntry(modelCode, productName, unitPrice));
            }
            return map;
        } catch (IOException | GeneralSecurityException ex) {
            log.warn("ProductCatalogLookupClient — sheet read fail-soft: {}", ex.getMessage());
            return Map.of();
        } catch (RuntimeException ex) {
            log.warn("ProductCatalogLookupClient — 예상치 못한 오류 fail-soft: {}", ex.getMessage());
            return Map.of();
        }
    }

    private static int findHeaderRow(List<List<Object>> rows) {
        if (rows == null) {
            return -1;
        }
        for (int i = 0; i < Math.min(10, rows.size()); i++) {
            List<Object> row = rows.get(i);
            if (row == null || row.isEmpty()) {
                continue;
            }
            String first = row.get(0) == null ? "" : row.get(0).toString().replace(" ", "");
            if (first.contains("품") && first.contains("명")) {
                return i;
            }
        }
        return -1;
    }

    private static String safeGet(List<String> cells, int index) {
        return index < cells.size() ? cells.get(index) : "";
    }

    private static BigDecimal parsePrice(String raw) {
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(raw.replace(",", "").replace("원", "").replace("₩", "").trim());
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * 시트 카탈로그 한 줄.
     *
     * @param modelCode 모델코드 (lookup key)
     * @param productName 사용자 표시 제품명
     * @param releasePrice 선택된 가격 기준의 출고가
     * @param unitPrice 선택된 가격 기준의 납품가 (VAT 포함 — 종합견적서 표기 기준)
     */
        public record CatalogEntry(String modelCode,
                               String productName,
                               BigDecimal releasePrice,
                               BigDecimal unitPrice) {

        /** 3열 flat override 는 납품가 전용 호환 경로라 출고가는 0으로 둔다. */
        public CatalogEntry(String modelCode, String productName, BigDecimal unitPrice) {
            this(modelCode, productName, BigDecimal.ZERO, zero(unitPrice));
        }
    }

    private record CatalogTab(String range,
                              int nameColumn,
                              int modelCodeColumn,
                              int releasePriceColumn,
                              int unitPriceColumn) {
        int requiredColumnCount() {
            return Math.max(
                    Math.max(nameColumn, modelCodeColumn),
                    Math.max(releasePriceColumn, unitPriceColumn)
            ) + 1;
        }
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
