package com.samhanair.logis.product.seed;
import com.samhanair.logis.product.domain.MaterialKey;
import com.samhanair.logis.product.service.VariableDiscountDetector;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Phase 6 M1a 시드 스크립트 — dry-run mode 우선 (G13 사용자 매핑 표 검토 후 실 시드).
 *
 * <p><b>출처</b>:
 * <ul>
 *     <li>Migration Plan §3.1 — 27 탭 → 14 entity 매핑 표</li>
 *     <li>DECISIONS G13 — BranchPipeLookup 99 row 매핑 표 PM 검토 후 실 시드</li>
 *     <li>DECISIONS G17 — splitBar/splitSlash/joinCols 룰</li>
 * </ul>
 *
 * <p>실행: {@code java -jar product-service.jar --spring.profiles.active=seed --seed.dry-run=true}.
 * 결과: docs/dev-reports/m1a-product-seed-dryrun.md (G13 매핑 표 포함).
 *
 * <p>본 runner 는 <b>profile=seed</b> 에서만 활성화. dry-run=true (default) 시 INSERT 안 하고
 * stdout + report 파일만 작성.
 */
@Component
@Profile("seed")
public class ProductSeedRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductSeedRunner.class);

    /** 단가인상 effectiveDate (DECISIONS G4). */
    private static final String PRICE_INC_DATE = "2026-04-01";

    @Value("${seed.dry-run:true}")
    private boolean dryRun;

    @Value("${seed.report-dir:docs/dev-reports}")
    private String reportDir;

    private final VariableDiscountDetector detector;

    public ProductSeedRunner(VariableDiscountDetector detector) {
        this.detector = detector;
    }

    @Override
    public void run(String... args) throws Exception {
        log.info("[M1a Seed] dry-run mode = {}", dryRun);
        SheetWorkbookReader reader = SheetWorkbookReader.fromEnvOrDefault();
        if (!reader.isAvailable()) {
            log.warn("[M1a Seed] 시트 dump 가 {} 에 없음 — SEED_SHEET_DIR 환경변수 또는 -Dseed.sheet.dir 지정 필요", reader.getSheetDir());
            return;
        }

        SeedDryRunResult result = new SeedDryRunResult();

        // 1) ProductMaster 시드 카테고리별 row 수 집계
        countMasterRows(reader, "홈멀티", "HOME_MULTI", "BOTH", result);
        countMasterRows(reader, "싱글 세트", "SINGLE_SET", "BOTH", result);
        countMasterRows(reader, "싱글 구성품", "SINGLE_PART", "NONE", result);
        countMasterRows(reader, "상업멀티", "COMMERCIAL_MULTI", "BOTH", result);
        countMasterRows(reader, "상업멀티 구성", "COMMERCIAL_PART", "NONE", result);
        countMasterRows(reader, "구형", "OLD", "BOTH", result);

        // 2) PriceHistory = ProductMaster 카테고리당 2 row (베이스 + 인상본)
        result.priceHistoryRowCount = result.productMasterRowCount * 2;

        // 3) BundleComponent — 싱글 구성품 (M열) + 상업멀티 구성 (I열) 시드 라인 수
        result.bundleComponentRowCount = countBundleComponents(reader);

        // 4) MaterialPrice — 싱글 자재가격 28 row
        result.materialPriceRowCount = countMaterialPrice(reader);

        // 5) BranchPipeLookup — 분기계산 99 row + G13 매핑 표
        result.branchPipeRowCount = countAndExtractBranchPipe(reader, result);

        // 6) OduRecommendationLookup — 추천실외기 24 row
        result.oduRecommendationRowCount = countOduRecommendation(reader);

        // 7) ProductSpec — 시트별 spec 컬럼 변환 row 수 (대략 추산)
        result.productSpecRowCount = estimateProductSpecRowCount(reader);

        // 8) SpecKeyTemplate — V4 SQL 시드 53 row
        result.specKeyTemplateRowCount = 53;

        // 9) 변동DC 룰 자동 판정 sample (sample 30 SKU 비교)
        result.discountDetectionSamples = detectVariableDiscountSamples(reader);

        writeReport(result);

        if (!dryRun) {
            log.warn("[M1a Seed] dry-run=false 모드 — 실제 INSERT 는 후속 PM 별도 commit 으로 처리. "
                    + "본 runner 는 dry-run 만 지원 (G13 매핑 표 PM 검토 게이트).");
        }

        log.info("[M1a Seed] 완료. 보고서: {}/m1a-product-seed-dryrun.md", reportDir);
    }

    private void countMasterRows(SheetWorkbookReader reader, String sheetName,
                                 String productCategory, String usageScope,
                                 SeedDryRunResult result) throws IOException {
        List<List<String>> rows = reader.sheetValues(sheetName);
        if (rows.isEmpty()) {
            log.warn("  시트 {} 데이터 없음", sheetName);
            return;
        }
        int headerIdx = reader.findHeaderRow(rows);
        int dataRows = headerIdx >= 0 ? Math.max(0, rows.size() - headerIdx - 1) : 0;
        result.bySheet.put(sheetName, new SheetCount(dataRows, productCategory, usageScope));
        result.productMasterRowCount += dataRows;
        log.info("  {}: header_idx={}, data_rows={}, productCategory={}, usageScope={}",
                sheetName, headerIdx, dataRows, productCategory, usageScope);
    }

    private int countBundleComponents(SheetWorkbookReader reader) throws IOException {
        // 싱글 구성품 부모 column M (idx 12) + 상업멀티 구성 I (idx 8) 채워진 row 수
        // 단순화: data row 전체 = component 라인 수 (DOMAIN-EXTENSIONS §2 합계 1885)
        int singlePart = countDataRows(reader, "싱글 구성품");
        int commPart = countDataRows(reader, "상업멀티 구성");
        return singlePart + commPart;
    }

    private int countMaterialPrice(SheetWorkbookReader reader) throws IOException {
        return countDataRows(reader, "싱글 자재가격");
    }

    private int countOduRecommendation(SheetWorkbookReader reader) throws IOException {
        return countDataRows(reader, "추천실외기");
    }

    private int countDataRows(SheetWorkbookReader reader, String sheetName) throws IOException {
        List<List<String>> rows = reader.sheetValues(sheetName);
        if (rows.isEmpty()) return 0;
        int headerIdx = reader.findHeaderRow(rows);
        if (headerIdx < 0) headerIdx = 0;
        return Math.max(0, rows.size() - headerIdx - 1);
    }

    private int countAndExtractBranchPipe(SheetWorkbookReader reader, SeedDryRunResult result) throws IOException {
        List<List<String>> rows = reader.sheetValues("분기계산");
        if (rows.isEmpty()) return 0;
        // 분기계산 시트는 row 0 가 헤더 (전체 분기관 개수 / 수동추가 / 선택 실내기 / 실외기1...)
        // row 1 이상 = 분기관 SKU 데이터 (A열 = branchCode)
        for (int i = 1; i < rows.size(); i++) {
            List<String> r = rows.get(i);
            if (r.isEmpty()) continue;
            String code = r.get(0);
            if (code == null || code.isBlank()) continue;
            String b = r.size() > 1 ? r.get(1) : "";
            String c = r.size() > 2 ? r.get(2) : "";
            String d = r.size() > 3 ? r.get(3) : "";
            String e = r.size() > 4 ? r.get(4) : "";
            result.branchPipeRows.add(new BranchPipeRow(i, code, b, c, d, e));
        }
        return result.branchPipeRows.size();
    }

    private int estimateProductSpecRowCount(SheetWorkbookReader reader) throws IOException {
        // estimate Code.js getSpecDetailMap_() 매트릭스 기준 카테고리별 추산 (NULL 컬럼 row 미생성).
        // 정확치 산출은 시드 시점 실제 변환 결과로 갱신.
        int home = countDataRows(reader, "홈멀티") * 14;        // 14 키
        int set = countDataRows(reader, "싱글 세트") * 21;      // 21 키 (splitBar/splitSlash 고려)
        int part = countDataRows(reader, "싱글 구성품") * 2;   // 규격/비고 2 키
        int comm = countDataRows(reader, "상업멀티") * 16;     // 16 키
        int commPart = countDataRows(reader, "상업멀티 구성") * 2; // 2 키
        int old = countDataRows(reader, "구형") * 2;          // 2 키
        return home + set + part + comm + commPart + old;
    }

    /**
     * sample 30 SKU 변동DC 룰 판정 결과 — Apps Script 출력값 1:1 비교 reference.
     * formulas.json 의 단가 컬럼 (D/E/F/G/H) 수식 grep → detector 적용.
     */
    private List<DiscountSample> detectVariableDiscountSamples(SheetWorkbookReader reader) throws IOException {
        List<DiscountSample> samples = new ArrayList<>();
        String[] sheetsToSample = {"홈멀티", "싱글 세트", "상업멀티", "구형"};
        int perSheet = 8; // 4 sheets * 8 = 32 ≥ 30
        for (String sn : sheetsToSample) {
            List<List<String>> formulas = reader.sheetFormulas(sn);
            List<List<String>> values = reader.sheetValues(sn);
            if (values.isEmpty()) continue;
            int headerIdx = reader.findHeaderRow(values);
            if (headerIdx < 0) continue;
            int picked = 0;
            for (int i = headerIdx + 1; i < values.size() && picked < perSheet; i++) {
                List<String> dataRow = values.get(i);
                if (dataRow.size() < 2) continue;
                String name = dataRow.get(0);
                String modelCode = dataRow.size() > 1 ? dataRow.get(1) : "";
                if (name == null || name.isBlank() || modelCode == null || modelCode.isBlank()) continue;
                // formula 행이 있으면 D~H 열 추출
                String formulaSnippet = "";
                if (i < formulas.size()) {
                    List<String> fr = formulas.get(i);
                    StringBuilder sb = new StringBuilder();
                    for (int c = 3; c < Math.min(8, fr.size()); c++) {
                        String f = fr.get(c);
                        if (f != null && !f.isBlank()) {
                            sb.append(f).append(' ');
                        }
                    }
                    formulaSnippet = sb.toString();
                }
                boolean has = detector.detectHasVariableDiscount(formulaSnippet);
                Optional<MaterialKey> mk = detector.detectMaterialKey(formulaSnippet);
                boolean legacy = "구형".equals(sn);
                String flags = detector.detectDiscountFlags(modelCode);
                samples.add(new DiscountSample(sn, modelCode, has, mk.map(Enum::name).orElse(null),
                        legacy, flags, formulaSnippet.length() > 80
                                ? formulaSnippet.substring(0, 80) + "..." : formulaSnippet));
                picked++;
            }
        }
        return samples;
    }

    private void writeReport(SeedDryRunResult result) throws IOException {
        Path dir = Path.of(reportDir);
        Files.createDirectories(dir);
        Path outPath = dir.resolve("m1a-product-seed-dryrun.md");
        try (BufferedWriter w = Files.newBufferedWriter(outPath)) {
            w.write("# M1a Product 시드 dry-run 결과\n\n");
            w.write("> Phase 6 M1a backend sub-team agent 산출. PM 검토 후 실 시드 (별도 commit).\n");
            w.write("> dry-run mode = " + dryRun + " (true 면 INSERT 안 함, 결과만 미리보기).\n\n");

            w.write("## 1. row count 요약\n\n");
            w.write("| entity | 시드 row 수 | 비고 |\n|---|---|---|\n");
            w.write("| ProductMaster | " + result.productMasterRowCount + " | 6 카테고리 합 (홈멀티+싱글세트+싱글구성품+상업멀티+상업멀티구성+구형) |\n");
            w.write("| PriceHistory | " + result.priceHistoryRowCount + " | ProductMaster × 2 (베이스 + " + PRICE_INC_DATE + ") |\n");
            w.write("| BundleComponent | " + result.bundleComponentRowCount + " | 싱글 구성품 + 상업멀티 구성 (DOMAIN-EXTENSIONS §2) |\n");
            w.write("| MaterialPrice | " + result.materialPriceRowCount + " | 싱글 자재가격 시트 row 2~29 |\n");
            w.write("| BranchPipeLookup | " + result.branchPipeRowCount + " | 분기계산 시트 99 row (G13 매핑 표 §3 참조) |\n");
            w.write("| OduRecommendationLookup | " + result.oduRecommendationRowCount + " | 추천실외기 시트 row 3~26 |\n");
            w.write("| ProductSpec | " + result.productSpecRowCount + " | 카테고리별 키 수 × 데이터 row (NULL 컬럼 미생성 가정 — 실측은 실 시드 시 갱신) |\n");
            w.write("| SpecKeyTemplate | " + result.specKeyTemplateRowCount + " | V4 SQL 시드 (HOME_MULTI 14 + SINGLE_SET 21 + COMMERCIAL_MULTI 16 + LEGACY 2) |\n\n");

            w.write("## 2. 시트별 ProductMaster 시드 분포\n\n");
            w.write("| 시트 | data_rows | productCategory | usageScope |\n|---|---|---|---|\n");
            for (Map.Entry<String, SheetCount> e : result.bySheet.entrySet()) {
                SheetCount c = e.getValue();
                w.write("| " + e.getKey() + " | " + c.dataRows + " | " + c.productCategory + " | " + c.usageScope + " |\n");
            }

            w.write("\n## 3. BranchPipeLookup 99 row 추출 결과 (G13 사용자 매핑 검토 대상)\n\n");
            w.write("> DECISIONS G13 — A열 코드 의미는 사용자 매핑 표 검토 후 실 시드.\n");
            w.write("> 본 row 들의 description 은 NULL 로 시드되며, 사용자 spot-check 결과를 PM 이 별도 PATCH 로 채움.\n\n");
            w.write("| row | A열 코드 (branchCode) | B열 (summary_qty) | C열 추정 | D열 추정 | E열 추정 | 추정 의미 |\n");
            w.write("|---|---|---|---|---|---|---|\n");
            for (BranchPipeRow row : result.branchPipeRows) {
                w.write("| " + row.rowIdx + " | " + esc(row.code) + " | " + esc(row.b) + " | "
                        + esc(row.c) + " | " + esc(row.d) + " | " + esc(row.e) + " | (사용자 검토) |\n");
            }

            w.write("\n## 4. 변동DC 룰 sample 판정 (Apps Script ↔ Java 1:1 비교 reference)\n\n");
            w.write("> sample " + result.discountDetectionSamples.size() + " SKU. 룰 1 ($L$2) / 룰 2 ($D$N) / 룰 3 ($I$1) / discountFlags prefix 7-룰.\n\n");
            w.write("| 시트 | modelCode | hasVariableDiscount | setMaterialKey | legacyDiscountFlag | discountFlags | formula snippet |\n");
            w.write("|---|---|---|---|---|---|---|\n");
            for (DiscountSample s : result.discountDetectionSamples) {
                w.write("| " + s.sheet + " | " + esc(s.modelCode) + " | " + s.hasVariableDiscount + " | "
                        + esc(s.setMaterialKey) + " | " + s.legacy + " | " + s.discountFlags + " | "
                        + esc(s.formulaSnippet) + " |\n");
            }

            w.write("\n## 5. 후속 PM 작업 (G13 통과 후)\n\n");
            w.write("1. 본 §3 BranchPipeLookup 99 row 매핑 표 → 사용자 검토 의뢰\n");
            w.write("2. 사용자 spot-check 결과 description 컬럼 채움 (V5__seed_branch_pipe.sql 별도 commit)\n");
            w.write("3. ProductMaster + PriceHistory + BundleComponent + MaterialPrice + OduRecommendation + ProductSpec 실 시드 (V6__seed_product_master.sql 별도 commit)\n");
            w.write("4. dry-run row count 와 실 시드 row count 1:1 비교 IT (m1a-product-seed-validation.md 갱신)\n");
        }
        log.info("[M1a Seed] 보고서 작성 완료: {}", outPath.toAbsolutePath());
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("|", "\\|").replace("\n", " ");
    }

    /** dry-run 결과 집계 컨테이너. */
    static class SeedDryRunResult {
        int productMasterRowCount = 0;
        int priceHistoryRowCount = 0;
        int bundleComponentRowCount = 0;
        int materialPriceRowCount = 0;
        int branchPipeRowCount = 0;
        int oduRecommendationRowCount = 0;
        int productSpecRowCount = 0;
        int specKeyTemplateRowCount = 0;
        Map<String, SheetCount> bySheet = new LinkedHashMap<>();
        List<BranchPipeRow> branchPipeRows = new ArrayList<>();
        List<DiscountSample> discountDetectionSamples = new ArrayList<>();
    }

    record SheetCount(int dataRows, String productCategory, String usageScope) {}

    record BranchPipeRow(int rowIdx, String code, String b, String c, String d, String e) {}

    record DiscountSample(String sheet, String modelCode, boolean hasVariableDiscount,
                          String setMaterialKey, boolean legacy, String discountFlags,
                          String formulaSnippet) {}
}
