package com.samhanair.logis.product.service;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.MaterialKey;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
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

    /** FORMULA read 는 JS readSheetGrid 와 맞춰 후행 수식 열 유실을 막기 위해 ZZ 까지 읽는다. */
    private static final String FORMULA_RANGE_END_COLUMN = "ZZ";

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

    /**
     * 구성품 탭 매핑 (BUNDLE 적재용). currentTab = `*_단가인상`(legacy 견적 read 1:1).
     * 컬럼은 고정 인덱스가 아니라 헤더 이름 기반(legacy {@code findIdx_})으로 해석한다.
     *
     * <p>싱글 구성품 = 부품당 수량 개념 없음 → 전부 FOLLOW_SET(세트수량 그대로).
     * 상업멀티 구성 = {@code 수량} 컬럼 'Q' → FOLLOW_SET(1), 숫자 N → FOLLOW_SET(N) (둘 다 setQty 비례 = legacy explodeCommSets_).
     */
    private static final List<ComponentTabMapping> COMPONENT_TAB_MAPPINGS = List.of(
            new ComponentTabMapping("싱글 구성품_단가인상", false),
            new ComponentTabMapping("상업멀티 구성_단가인상", true));

    /**
     * 사양(ProductSpec) 적재 — 사양 보유 탭(홈멀티/싱글세트/상업멀티)의 legacy getSpecDetailMap_ 매핑 컬럼을
     * V17 spec_key/value/unit 으로 적재한다.
     *
     * <p><b>정책</b>: 사양 보유 탭은 개발책임자 "원래 스펙 그대로" 결정에 따라 매핑 사양만 적재하고,
     * 미매핑 헤더는 debug 로그로만 남긴다. 구형/구성품 등 비사양 카테고리는 기존 blocklist fallback 으로
     * 데이터 보존을 유지한다.
     */
    // 헤더 공백제거 정규화형 기준(예: "소  계"→"소계").
    private static final Set<String> SPEC_EXCLUDE_HEADERS = Set.of(
            "품명", "품", "품목", "항목", "모델명", "모델", "품목코드", "기종", "단위",
            "출고가", "정가", "소비자가", "LIST", "납품가", "소계", "평형",
            "세트", "고정DC", "비고", "대분류", "구분", "수량", "구성품특징", "특징");

    /** 부모-자식 연결 컬럼(자식의 부모 세트 modelCode) 헤더 후보. */
    private static final List<String> SET_HEADERS = List.of("세트");
    private static final List<String> MODEL_HEADERS = List.of("모델명", "모델", "품목코드", "기종");
    private static final List<String> KIND_HEADERS = List.of("구분");
    private static final List<String> QTY_HEADERS = List.of("수량");
    private static final List<String> VARIANT_HEADERS = List.of("구성품특징", "특징");
    private static final List<String> SPEC_HEADERS = List.of("규격");

    private final GoogleSheetsClient sheetsClient;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ClassificationRepository classificationRepository;
    private final PriceHistoryRepository priceHistoryRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final ProductSpecRepository productSpecRepository;
    private final ProductEstimateExposureRepository exposureRepository;
    private final VariableDiscountDetector discountDetector;
    private final ProductAttributeClassifier attributeClassifier;
    private final QuantitySyncRuleService quantitySyncRuleService;
    private final EcountAliasReservationService ecountAliasReservationService;
    private final ProductSheetSyncService self;

    /** rowHash 캐시 — JVM 메모리. (시트 row → SHA-256). 다음 sync 시 비교. */
    private final Map<String, String> lastKnownRowHash = new ConcurrentHashMap<>();

    public ProductSheetSyncService(GoogleSheetsClient sheetsClient,
                                   ProductRepository productRepository,
                                   CategoryRepository categoryRepository,
                                   ClassificationRepository classificationRepository,
                                   PriceHistoryRepository priceHistoryRepository,
                                   BundleComponentRepository bundleComponentRepository,
                                   ProductSpecRepository productSpecRepository,
                                   ProductEstimateExposureRepository exposureRepository,
                                   VariableDiscountDetector discountDetector,
                                   ProductAttributeClassifier attributeClassifier,
                                   QuantitySyncRuleService quantitySyncRuleService,
                                   EcountAliasReservationService ecountAliasReservationService,
                                   @Lazy ProductSheetSyncService self) {
        this.sheetsClient = sheetsClient;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.classificationRepository = classificationRepository;
        this.priceHistoryRepository = priceHistoryRepository;
        this.bundleComponentRepository = bundleComponentRepository;
        this.productSpecRepository = productSpecRepository;
        this.exposureRepository = exposureRepository;
        this.discountDetector = discountDetector;
        this.attributeClassifier = attributeClassifier;
        this.quantitySyncRuleService = quantitySyncRuleService;
        this.ecountAliasReservationService = ecountAliasReservationService;
        this.self = self;
    }

    /** 사양 보유 카테고리(legacy getSpecDetailMap_ scanHome/scanSingle/scanComm). */
    private static boolean isSpecBearing(ProductCategory category) {
        return category == ProductCategory.HOME_MULTI
                || category == ProductCategory.SINGLE_SET
                || category == ProductCategory.COMMERCIAL_MULTI;
    }

    private static boolean isPanelRow(String name, String modelCode) {
        String n = name == null ? "" : name;
        String m = modelCode == null ? "" : modelCode;
        return n.matches(".*(판넬|판널|패널).*") || m.matches("(?i)PC[0-9].*");
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
                TabSyncResult tabResult = self.syncTab(mapping, defaultCategory);
                summary.byTab.put(mapping.tabName, tabResult);
                summary.totalInserted += tabResult.inserted;
                summary.totalUpdated += tabResult.updated;
                summary.totalSoftDeleted += tabResult.softDeleted;
                summary.totalSkipped += tabResult.skipped;
                summary.totalPreservedManual += tabResult.preservedManual;
                summary.totalPreservedByRule += tabResult.preservedByRule;
                summary.totalSpecsLinked += tabResult.specsLinked;
            } catch (Exception e) {
                log.error("[ProductSheetSync] tab '{}' sync 실패: {}", mapping.tabName, e.getMessage(), e);
                TabSyncResult err = new TabSyncResult();
                err.error = e.getMessage();
                summary.byTab.put(mapping.tabName, err);
            }
        }

        // 구성품(BUNDLE) 적재 — Product 전 tab sync 완료 후 부모/자식이 모두 DB 에 존재하는 시점.
        for (ComponentTabMapping cm : COMPONENT_TAB_MAPPINGS) {
            try {
                ComponentSyncResult cr = self.syncComponentTab(cm);
                summary.byComponentTab.put(cm.tabName, cr);
                summary.totalComponentsLinked += cr.linked;
                summary.totalBundlesMarked += cr.bundlesMarked;
            } catch (Exception e) {
                log.error("[ProductSheetSync] 구성품 tab '{}' sync 실패: {}", cm.tabName, e.getMessage(), e);
                ComponentSyncResult err = new ComponentSyncResult();
                err.error = e.getMessage();
                summary.byComponentTab.put(cm.tabName, err);
            }
        }

        summary.durationMs = Instant.now().toEpochMilli() - started.toEpochMilli();
        log.info("[ProductSheetSync] sync 완료: 총 inserted={}, updated={}, softDeleted={}, skipped={}, "
                        + "preservedManual={}, 구성품 linked={}, bundle marked={}, 사양 linked={}, duration={}ms",
                summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted,
                summary.totalSkipped, summary.totalPreservedManual,
                summary.totalComponentsLinked, summary.totalBundlesMarked,
                summary.totalSpecsLinked, summary.durationMs);
        return summary;
    }

    /**
     * 구성품 tab 1개 sync — 자식의 {@code 세트} 컬럼으로 부모 BUNDLE 을 찾아 BundleComponent 적재.
     *
     * <p>① 부모 Product 를 {@code productType=BUNDLE} + bundleMode(KEEP 패턴 → KEEP, else EXPAND) 마킹.
     * ② 자식 Product 의 {@code parentBundleSetModel} 설정. ③ BundleComponent upsert(멱등).
     * ④ 시트에서 사라진 (부모,자식) 구성품 행은 soft-delete.
     *
     * <p>수량: 싱글 = FOLLOW_SET(1) / 상업 = {@code 수량}='Q'→FOLLOW_SET(1), 숫자 N→FOLLOW_SET(N) (둘 다 setQty 비례).
     * GAS 종합견적서 explodeSetParts/explodeCommSets_ 의 수량 전파와 정합.
     */
    @Transactional
    public ComponentSyncResult syncComponentTab(ComponentTabMapping mapping) throws Exception {
        ComponentSyncResult result = new ComponentSyncResult();
        String syncKey = sheetSyncKey("component:" + mapping.tabName);
        long syncGeneration = quantitySyncRuleService.reserveSheetSyncGeneration(syncKey);
        String range = mapping.tabName + "!A1:Z";
        List<List<Object>> rows = sheetsClient.readSheetDisplay(sheetId, range);
        if (rows == null || rows.isEmpty()) {
            log.warn("[ProductSheetSync] 구성품 tab '{}' 빈 시트 — skip", mapping.tabName);
            return result;
        }

        int headerIdx = findComponentHeaderRow(rows);
        if (headerIdx < 0) {
            log.warn("[ProductSheetSync] 구성품 tab '{}' 헤더(세트+모델) 탐색 실패 — skip", mapping.tabName);
            return result;
        }
        List<String> header = GoogleSheetsClient.toStringRow(rows.get(headerIdx), 30);
        int cSet = findColumnByHeader(header, SET_HEADERS);
        int cModel = findColumnByHeader(header, MODEL_HEADERS);
        int cKind = findColumnByHeader(header, KIND_HEADERS);
        int cQty = findColumnByHeader(header, QTY_HEADERS);
        int cVariant = findColumnByHeader(header, VARIANT_HEADERS);
        int cSpec = findColumnByHeader(header, SPEC_HEADERS);
        if (cSet < 0 || cModel < 0) {
            log.warn("[ProductSheetSync] 구성품 tab '{}' 세트/모델 컬럼 부재 — skip", mapping.tabName);
            return result;
        }

        // 부모 Product.id → 이번 시트에서 본 자식코드 set (soft-delete 대상 산출용).
        Map<UUID, Set<String>> seenByParent = new HashMap<>();
        // 부모 Product.id → PESSIMISTIC_WRITE 획득 여부. 같은 부모는 sync 트랜잭션 안에서 1회만 잠근다.
        Set<UUID> lockedParents = new HashSet<>();
        // 부모 Product.id → 이미 BUNDLE 마킹했는지(중복 마킹 회피).
        Set<UUID> markedBundles = new HashSet<>();

        // 외부 Sheets read는 잠금 밖에서 끝낸다. 이후 graph mutation 전체는
        // rule CRUD와 동일한 advisory lock 아래에서 세대 확인과 함께 수행한다.
        quantitySyncRuleService.lockGraphMutation();
        if (!quantitySyncRuleService.isCurrentSheetSyncGeneration(syncKey, syncGeneration)) {
            log.info("[ProductSheetSync] component tab '{}' stale response skipped (generation={})",
                    mapping.tabName, syncGeneration);
            return result;
        }

        for (int i = headerIdx + 1; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            if (row == null || row.isEmpty()) continue;
            List<String> cells = GoogleSheetsClient.toStringRow(row, 30);
            String setModel = safeGet(cells, cSet).trim();
            String childModel = safeGet(cells, cModel).trim();
            if (setModel.isBlank() || childModel.isBlank()) continue;

            Optional<Product> parentOpt = productRepository.findByModelCodeAndIsDeletedFalse(setModel);
            Optional<Product> childOpt = productRepository.findByModelCodeAndIsDeletedFalse(childModel);
            if (parentOpt.isEmpty() || childOpt.isEmpty()) {
                // 부모/자식 미존재(시트 정합 이슈) — 조용히 skip(부모 sync 가 우선).
                result.skipped++;
                continue;
            }
            Product parent = parentOpt.get();
            Product child = childOpt.get();
            if (!lockedParents.contains(parent.getId())) {
                // replaceComponents 와 같은 부모 행 잠금을 사용해 manual replace-all ↔ sheet sync 를 직렬화한다.
                parent = productRepository.findByIdForUpdate(parent.getId())
                        .orElseThrow(() -> new IllegalStateException("구성품 부모 품목을 잠금 조회할 수 없습니다: "
                                + parentOpt.get().getId()));
                lockedParents.add(parent.getId());
            }

            // 수기 편집 세트는 시트 sync 가 구성품 집합을 덮어쓰지 않는다.
            // seenByParent 에 넣지 않아 soft-delete 단계도 함께 건너뛴다.
            if (parent.isBundleComponentsManual()) {
                result.preservedManual++;
                continue;
            }

            String kindRaw = cKind >= 0 ? safeGet(cells, cKind).trim() : "";
            String variant = cVariant >= 0 ? safeGet(cells, cVariant).trim() : "";
            String spec = cSpec >= 0 ? safeGet(cells, cSpec).trim() : "";
            String qtyRaw = (mapping.hasQtyColumn && cQty >= 0) ? safeGet(cells, cQty).trim() : "";
            BundleComponent.ComponentKind kind = mapComponentKind(kindRaw, child.getName(), variant);
            if (kind == BundleComponent.ComponentKind.ACCESSORY
                    && child.getProductCategory() == ProductCategory.COMMERCIAL_MULTI) {
                kind = BundleComponent.ComponentKind.OUTDOOR;
            }
            boolean isDefault = (variant + " " + kindRaw).contains("기본");

            QtyAndMode qm = resolveQty(mapping.hasQtyColumn, qtyRaw);

            // ① 부모 BUNDLE 마킹(중복 회피).
            // ② 자식 parentBundleSetModel.
            // ③ BundleComponent upsert(부모,자식코드 natural key).
            List<BundleComponent> existing = bundleComponentRepository.findByBundleProductId(parent.getId());
            BundleComponent match = existing.stream()
                    .filter(b -> b.getComponentProductCode().equals(childModel))
                    .findFirst().orElse(null);
            if (match == null) {
                // 🚨 2026-07-28 재수렴 R6 결함 3 [MED] 계열 sweep (I-3) — 신규 (부모,자식)
                // 링크만 검사한다(기존 match 갱신은 구성품 집합 자체를 바꾸지 않으므로 대상
                // 아님). 이 부모를 source로 갖는 활성 규칙의 target이 결과 구성품 집합에
                // 들어오면 이 행만 skip하고 나머지 시트 sync는 계속한다(자동 배치 경로라
                // 예외로 전체 탭을 실패시키지 않는다 — soft-delete 가드(④)와 같은 패턴).
                Set<UUID> resultingComponentProductIds = existing.stream()
                        .map(BundleComponent::getComponentProductCode)
                        .distinct()
                        .map(code -> productRepository.findByModelCodeAndIsDeletedFalse(code))
                        .filter(Optional::isPresent)
                        .map(opt -> opt.get().getId())
                        .collect(java.util.stream.Collectors.toCollection(HashSet::new));
                resultingComponentProductIds.add(child.getId());
                List<String> brokenRuleKeys = quantitySyncRuleService
                        .findEnabledRuleKeysBrokenByBundleComponents(parent.getId(), resultingComponentProductIds);
                if (!brokenRuleKeys.isEmpty()) {
                    log.warn("[ProductSheetSync] 구성품 tab '{}' 부모='{}' 자식='{}' → 활성 수량 동기화"
                                    + " 규칙({}) 자기구성품 충돌로 연결 제외",
                            mapping.tabName, setModel, childModel, String.join(", ", brokenRuleKeys));
                    result.blockedByRule++;
                    continue;
                }
            }

            // 규칙 확인을 통과한 뒤에만 부모 BUNDLE 표식, 자식 부모 표식, 링크를
            // 같은 트랜잭션에서 반영한다. 충돌 skip은 어떤 부분 상태도 남기지 않는다.
            if (!markedBundles.contains(parent.getId())) {
                BundleMode mode = isKeepSet(parent.getModelCode(), parent.getName())
                        ? BundleMode.KEEP : BundleMode.EXPAND;
                parent.changeBundle(ProductType.BUNDLE, mode);
                productRepository.save(parent);
                markedBundles.add(parent.getId());
                result.bundlesMarked++;
            }
            if (!setModel.equals(child.getParentBundleSetModel())) {
                child.changeParentBundleSetModel(setModel);
                productRepository.save(child);
            }
            if (match == null) {
                bundleComponentRepository.save(BundleComponent.seed(parent.getId(), childModel,
                        qm.qty, qm.mode, kind, blankToNull(variant), isDefault, blankToNull(spec)));
            } else {
                match.changeAttributes(qm.qty, qm.mode, kind, blankToNull(variant), isDefault, blankToNull(spec));
                bundleComponentRepository.save(match);
            }
            result.linked++;
            seenByParent.computeIfAbsent(parent.getId(), k -> new HashSet<>()).add(childModel);
        }

        // ④ soft-delete: 본 부모의 DB 구성품 중 이번 시트에 없는 것.
        for (Map.Entry<UUID, Set<String>> e : seenByParent.entrySet()) {
            for (BundleComponent b : bundleComponentRepository.findByBundleProductId(e.getKey())) {
                if (!e.getValue().contains(b.getComponentProductCode())) {
                    b.markDeleted("system-sheet-sync");
                    bundleComponentRepository.save(b);
                    result.softDeleted++;
                }
            }
        }

        log.info("[ProductSheetSync] 구성품 tab '{}': linked={}, bundlesMarked={}, softDeleted={}, skipped={}",
                mapping.tabName, result.linked, result.bundlesMarked, result.softDeleted, result.skipped);
        return result;
    }

    /**
     * 사양 적재 — legacy {@code getSpecDetailMap_()} 인덱스 해석을 카테고리별 allowlist 로 포팅한다.
     * 사양 보유 카테고리는 매핑된 구헤더만 V17 spec_key/value/unit 로 저장한다.
     *
     * @return 이번 row 에 적재(upsert)한 spec 개수
     */
    private int loadSpecsForProduct(UUID productId, List<String> header, List<String> cells, SheetTabMapping mapping) {
        Set<String> seenKeys = new HashSet<>();
        Set<Integer> consumedColumns = new HashSet<>();
        int linked = 0;
        boolean specBearing = isSpecBearing(mapping.productCategory);
        String rowName = safeGet(cells, mapping.nameColumn);
        String rowModelCode = safeGet(cells, mapping.modelCodeColumn);
        if (mapping.estimateCategory == EstimateCategory.HOME_MULTI) {
            linked += loadHomeSpecs(productId, header, cells, rowName, rowModelCode, seenKeys, consumedColumns);
        } else if (mapping.estimateCategory == EstimateCategory.SINGLE_SET) {
            linked += loadSingleSpecs(productId, header, cells, rowName, rowModelCode, seenKeys, consumedColumns);
        } else if (mapping.estimateCategory == EstimateCategory.COMMERCIAL_MULTI) {
            linked += loadCommercialSpecs(productId, header, cells, rowName, rowModelCode, seenKeys, consumedColumns);
        }
        if (specBearing) {
            logUnmappedSpecHeaders(mapping, header, cells, consumedColumns);
        } else {
            linked += loadBlocklistSpecs(productId, header, cells, mapping, seenKeys, consumedColumns);
        }

        // soft-delete: 이번 시트에 더 이상 없는 기존 spec 키. 매핑된 구키는 seenKeys 에 없으므로 여기서 정리된다.
        for (ProductSpec s : productSpecRepository.findByProductIdOrderByDisplayOrderAsc(productId)) {
            if (!seenKeys.contains(s.getSpecKey())) {
                s.markDeleted("system-sheet-sync");
                productSpecRepository.save(s);
            }
        }
        return linked;
    }

    private int loadBlocklistSpecs(UUID productId, List<String> header, List<String> cells, SheetTabMapping mapping,
                                   Set<String> seenKeys, Set<Integer> consumedColumns) {
        int linked = 0;
        for (int col = 0; col < header.size(); col++) {
            if (shouldSkipBlocklistSpecColumn(col, header, cells, mapping, consumedColumns)) continue;
            String h = normHeader(header.get(col));
            String key = h.length() > 50 ? h.substring(0, 50) : h;
            String value = safeGet(cells, col).trim();
            if (upsertSpec(productId, seenKeys, key, value, null, col)) {
                linked++;
            }
        }
        return linked;
    }

    private void logUnmappedSpecHeaders(SheetTabMapping mapping, List<String> header, List<String> cells,
                                        Set<Integer> consumedColumns) {
        List<String> unmappedHeaders = new ArrayList<>();
        for (int col = 0; col < header.size(); col++) {
            if (!shouldSkipBlocklistSpecColumn(col, header, cells, mapping, consumedColumns)) {
                unmappedHeaders.add(normHeader(header.get(col)));
            }
        }
        if (!unmappedHeaders.isEmpty()) {
            log.debug("[ProductSheetSync] {} 미매핑 헤더 제외(매핑전용): {}",
                    mapping.productCategory, unmappedHeaders);
        }
    }

    private static boolean shouldSkipBlocklistSpecColumn(int col, List<String> header, List<String> cells,
                                                         SheetTabMapping mapping, Set<Integer> consumedColumns) {
        if (consumedColumns.contains(col)) {
            return true;
        }
        if (col == mapping.nameColumn || col == mapping.modelCodeColumn
                || col == mapping.releasePriceColumn || col == mapping.deliveryPriceColumn) {
            return true;
        }
        String h = normHeader(header.get(col));
        if (h.isBlank() || SPEC_EXCLUDE_HEADERS.contains(h) || isPriceLikeHeader(h)) {
            return true;
        }
        String value = safeGet(cells, col).trim();
        return value.isBlank() || "-".equals(value);
    }

    private int loadHomeSpecs(UUID productId, List<String> header, List<String> cells,
                              String name, String modelCode,
                              Set<String> seenKeys, Set<Integer> consumedColumns) {
        List<String> H = normalizedHeaders(header);
        List<Integer> coolCols = new ArrayList<>();
        for (int i = 0; i < H.size(); i++) {
            String h = H.get(i);
            if ("냉방성능(정격)".equals(h) || h.contains("냉방성능")) {
                coolCols.add(i);
            }
        }

        int iCoolKw = coolCols.size() > 0 ? coolCols.get(0) : -1;
        int iCoolKcal = coolCols.size() > 1 ? coolCols.get(1) : -1;
        int guessKcal = findContainsRaw(header, Pattern.compile("kcal", Pattern.CASE_INSENSITIVE));
        int guessKw = findContainsRaw(header, Pattern.compile("kW", Pattern.CASE_INSENSITIVE));
        if (iCoolKcal < 0 && guessKcal >= 0) iCoolKcal = guessKcal;
        if (iCoolKw < 0 && guessKw >= 0) iCoolKw = guessKw;

        int iPowKw = idx(H, "소비전력(정격)");
        if (iPowKw < 0) iPowKw = findContainsNorm(H, "소비전력");

        if (isPanelRow(name, modelCode)) {
            return loadPanelSpecs(productId, seenKeys, consumedColumns, cells, H, coolCols, iPowKw,
                    9, 10, 11, 12, 16, 17, true);
        }

        int linked = 0;
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "배관경"),
                "배관경", null, 1, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iCoolKcal,
                "냉방능력, kcal/h", "kcal/h", 2, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iCoolKw,
                "냉방능력, kW", "kW", 3, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iPowKw,
                "냉방소비전력, kW", "kW", 4, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "냉매가스"),
                "냉매가스", null, 5, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "에너지소비효율", "에너지소비효율등급"),
                "에너지소비효율등급", null, 6, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "전원선"),
                "전원선, mm²", "mm²", 7, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "차단기"),
                "차단기, A", "A", 8, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품크기"),
                "제품크기, mm", "mm", 9, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품중량"),
                "제품중량, kg", "kg", 10, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장치수"),
                "포장치수, mm", "mm", 11, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장중량"),
                "포장중량, kg", "kg", 12, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, firstExistingIdx(H, "최대장배관", "최대장배관"),
                "배관길이, m", "m", 13, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, firstExistingIdx(H, "최대고저차", "최대고저차"),
                "고낙차, m", "m", 14, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "최대연결실내기대수", "최대연결실내기대수"),
                "최대 연결 실내기 대수, 대", "대", 15, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "타공사이즈", "타공사이즈(mm)"),
                "타공사이즈, mm", "mm", 16, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "전산볼트간격", "전산볼트간격(mm)"),
                "전산볼트간격, mm", "mm", 17, SpecValueMode.NUMBER);
        return linked;
    }

    private int loadSingleSpecs(UUID productId, List<String> header, List<String> cells,
                                String name, String modelCode,
                                Set<String> seenKeys, Set<Integer> consumedColumns) {
        List<String> H = normalizedHeaders(header);
        int iPowKw = firstExistingIdx(H, "소비전력(kW)(최소/정격/최대)", "소비전력(kW)(최소/정격/최대)");
        int iCapKw = firstExistingIdx(H, "성능(kW)(최소/정격/최대)", "성능(kW)(최소/정격/최대)");
        int iCapKcal = firstExistingIdx(H, "성능(kcal/h)(최소/정격/최대)", "성능(kcal/h)(최소/정격/최대)");
        if (isPanelRow(name, modelCode)) {
            return loadPanelSpecs(productId, seenKeys, consumedColumns, cells, H,
                    validCols(iCapKcal, iCapKw), iPowKw,
                    -1, -1, -1, -1, 22, 23, false);
        }
        Pair pow = splitBar(cell(cells, iPowKw));
        Pair capKw = splitBar(cell(cells, iCapKw));
        Pair capKcal = splitBar(cell(cells, iCapKcal));
        Pair powerBreaker = splitSlash(cell(cells, firstExistingIdx(H, "전원(mm²)/차단(A)", "전원(mm²)/차단(A)")));
        Pair pipeDrop = splitSlash(cell(cells, firstExistingIdx(H, "배관길이/고낙차(m)", "배관길이/고낙차(m)")));

        int linked = 0;
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "배관경"),
                "배관경", null, 1, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iCapKcal,
                "냉방능력, kcal/h", capKcal.a(), "kcal/h", 2, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iCapKcal,
                "난방능력, kcal/h", capKcal.b(), "kcal/h", 3, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iCapKw,
                "냉방능력, kW", capKw.a(), "kW", 4, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iCapKw,
                "난방능력, kW", capKw.b(), "kW", 5, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iPowKw,
                "냉방소비전력, kW", pow.a(), "kW", 6, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, iPowKw,
                "난방소비전력, kW", pow.b(), "kW", 7, SpecValueMode.RANGE);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "냉매가스"),
                "냉매가스", null, 8, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "등급(냉방/난방)", "등급(냉방/난방)"),
                "에너지소비효율등급", null, 9, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns,
                firstExistingIdx(H, "전원(mm²)/차단(A)", "전원(mm²)/차단(A)"),
                "전원선, mm²", powerBreaker.a(), "mm²", 10, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns,
                firstExistingIdx(H, "전원(mm²)/차단(A)", "전원(mm²)/차단(A)"),
                "차단기, A", powerBreaker.b(), "A", 11, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실내기크기(mm)", "실내기크기(mm)"),
                "실내기크기, mm", "mm", 12, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실외기크기(mm)", "실외기크기(mm)"),
                "실외기크기, mm", "mm", 13, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실내기중량(kg)", "실내기중량(kg)"),
                "실내기중량, kg", "kg", 14, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실외기중량(kg)", "실외기중량(kg)"),
                "실외기중량, kg", "kg", 15, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실내기포장(mm)", "실내기포장(mm)"),
                "실내기포장, mm", "mm", 16, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실외기포장(mm)", "실외기포장(mm)"),
                "실외기포장, mm", "mm", 17, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실내기포장중량(kg)", "실내기포장중량(kg)"),
                "실내기포장중량, kg", "kg", 18, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "실외기포장중량(kg)", "실외기포장중량(kg)"),
                "실외기포장중량, kg", "kg", 19, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns,
                firstExistingIdx(H, "배관길이/고낙차(m)", "배관길이/고낙차(m)"),
                "배관길이, m", pipeDrop.a(), "m", 20, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns,
                firstExistingIdx(H, "배관길이/고낙차(m)", "배관길이/고낙차(m)"),
                "고낙차, m", pipeDrop.b(), "m", 21, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "타공사이즈", "타공사이즈(mm)"),
                "타공사이즈, mm", "mm", 22, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "전산볼트간격", "전산볼트간격(mm)"),
                "전산볼트간격, mm", "mm", 23, SpecValueMode.NUMBER);
        return linked;
    }

    private int loadCommercialSpecs(UUID productId, List<String> header, List<String> cells,
                                    String name, String modelCode,
                                    Set<String> seenKeys, Set<Integer> consumedColumns) {
        List<String> H = normalizedHeaders(header);
        List<ColumnGroup> groups = commercialGroups(header);
        List<Integer> coolCapCols = groups.size() > 0 ? groups.get(0).cols() : List.of();
        List<Integer> coolPowCols = groups.size() > 1 ? groups.get(1).cols() : List.of();
        List<Integer> heatCapCols = groups.size() > 2 ? groups.get(2).cols() : List.of();
        List<Integer> heatPowCols = groups.size() > 3 ? groups.get(3).cols() : List.of();
        boolean isErvLayout = (coolCapCols.size() == 3 && coolPowCols.size() == 3
                && heatCapCols.size() == 3 && heatPowCols.size() == 3)
                || (coolCapCols.size() == 2 && coolPowCols.size() == 1
                && heatCapCols.size() == 2 && heatPowCols.size() == 1);

        List<Integer> coolCols = collectRawContains(header, Pattern.compile("냉방\\s*성능"));
        List<Integer> heatCols = collectRawContains(header, Pattern.compile("난방\\s*성능"));
        List<Integer> powCols = collectRawContains(header, Pattern.compile("소비\\s*전력"));
        int iDuct = firstExistingIdx(H, "덕트구경", "덕트구경");

        if (isPanelRow(name, modelCode)) {
            int iPowCool = powCols.size() > 0 ? powCols.get(0) : -1;
            return loadPanelSpecs(productId, seenKeys, consumedColumns, cells, H, coolCols, iPowCool,
                    12, 13, 14, 15, 19, 20, true);
        }

        int linked = 0;
        if (isErvLayout) {
            linked += addMappedSpec(productId, seenKeys, consumedColumns, coolCapCols,
                    "냉방능력, kcal/h", joinCols(cells, coolCapCols), "kcal/h", 2, SpecValueMode.AS_IS);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, heatCapCols,
                    "난방능력, kcal/h", joinCols(cells, heatCapCols), "kcal/h", 3, SpecValueMode.AS_IS);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, coolPowCols,
                    "냉방소비전력, kW", joinCols(cells, coolPowCols), "kW", 6, SpecValueMode.AS_IS);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, heatPowCols,
                    "난방소비전력, kW", joinCols(cells, heatPowCols), "kW", 7, SpecValueMode.AS_IS);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iDuct >= 0 ? iDuct : idx(H, "냉매가스"),
                    "냉매가스", null, 8, SpecValueMode.AS_IS);
        } else {
            int iCoolKcal = coolCols.size() > 0 ? coolCols.get(0) : -1;
            int iCoolKw = coolCols.size() >= 2 ? coolCols.get(1) : (iCoolKcal >= 0 ? iCoolKcal + 1 : -1);
            int iHeatKcal = heatCols.size() > 0 ? heatCols.get(0) : -1;
            int iHeatKw = heatCols.size() >= 2 ? heatCols.get(1) : (iHeatKcal >= 0 ? iHeatKcal + 1 : -1);
            int iPowCool = powCols.size() > 0 ? powCols.get(0) : -1;
            int iPowHeat = powCols.size() >= 2 ? powCols.get(powCols.size() - 1) : (iPowCool >= 0 ? iPowCool + 1 : -1);

            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "배관경"),
                    "배관경", null, 1, SpecValueMode.AS_IS);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iCoolKcal,
                    "냉방능력, kcal/h", "kcal/h", 2, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iHeatKcal,
                    "난방능력, kcal/h", "kcal/h", 3, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iCoolKw,
                    "냉방능력, kW", "kW", 4, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iHeatKw,
                    "난방능력, kW", "kW", 5, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iPowCool,
                    "냉방소비전력, kW", "kW", 6, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, iPowHeat,
                    "난방소비전력, kW", "kW", 7, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "냉매가스"),
                    "냉매가스", null, 8, SpecValueMode.AS_IS);
        }

        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "소비효율등급", "에너지소비효율등급"),
                "소비효율등급", null, 9, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "전원선"),
                "전원선, mm²", "mm²", 10, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "차단기"),
                "차단기, A", "A", 11, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품크기"),
                "제품크기, mm", "mm", 12, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품중량"),
                "제품중량, kg", "kg", 13, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장치수"),
                "포장치수, mm", "mm", 14, SpecValueMode.DIMENSION);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장중량"),
                "포장중량, kg", "kg", 15, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "최대장배관", "배관길이"),
                "배관길이, m", "m", 16, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "최대고저차", "고낙차"),
                "고낙차, m", "m", 17, SpecValueMode.AS_IS);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "최대연결실내기대수", "최대연결실내기대수"),
                "최대 연결 실내기 대수, 대", "대", 18, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "타공사이즈", "타공사이즈(mm)"),
                "타공사이즈, mm", "mm", 19, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells,
                firstExistingIdx(H, "전산볼트간격", "전산볼트간격(mm)"),
                "전산볼트간격, mm", "mm", 20, SpecValueMode.NUMBER);
        return linked;
    }

    private int loadPanelSpecs(UUID productId, Set<String> seenKeys, Set<Integer> consumedColumns,
                               List<String> cells, List<String> H, List<Integer> punchCols, int boltCol,
                               int sizeOrder, int weightOrder, int packageSizeOrder, int packageWeightOrder,
                               int punchOrder, int boltOrder, boolean includePhysicalSpecs) {
        int linked = 0;
        int punchCol = firstNonBlankColumn(cells, punchCols);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, punchCols,
                "타공사이즈, mm", cell(cells, punchCol), "mm", punchOrder, SpecValueMode.NUMBER);
        linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, boltCol,
                "전산볼트간격, mm", "mm", boltOrder, SpecValueMode.NUMBER);

        if (includePhysicalSpecs) {
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품크기"),
                    "제품크기, mm", "mm", sizeOrder, SpecValueMode.DIMENSION);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "제품중량"),
                    "제품중량, kg", "kg", weightOrder, SpecValueMode.NUMBER);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장치수"),
                    "포장치수, mm", "mm", packageSizeOrder, SpecValueMode.DIMENSION);
            linked += addMappedSpec(productId, seenKeys, consumedColumns, cells, idx(H, "포장중량"),
                    "포장중량, kg", "kg", packageWeightOrder, SpecValueMode.NUMBER);
        }
        return linked;
    }

    private int addMappedSpec(UUID productId, Set<String> seenKeys, Set<Integer> consumedColumns,
                              List<String> cells, int col, String key, String unit,
                              int displayOrder, SpecValueMode mode) {
        return addMappedSpec(productId, seenKeys, consumedColumns, col, key, cell(cells, col), unit, displayOrder, mode);
    }

    private int addMappedSpec(UUID productId, Set<String> seenKeys, Set<Integer> consumedColumns,
                              int col, String key, String rawValue, String unit,
                              int displayOrder, SpecValueMode mode) {
        if (col >= 0) {
            consumedColumns.add(col);
        }
        return upsertSpec(productId, seenKeys, key, normalizeSpecValue(rawValue, mode), unit, displayOrder) ? 1 : 0;
    }

    private int addMappedSpec(UUID productId, Set<String> seenKeys, Set<Integer> consumedColumns,
                              List<Integer> cols, String key, String rawValue, String unit,
                              int displayOrder, SpecValueMode mode) {
        consumedColumns.addAll(cols);
        return upsertSpec(productId, seenKeys, key, normalizeSpecValue(rawValue, mode), unit, displayOrder) ? 1 : 0;
    }

    private boolean upsertSpec(UUID productId, Set<String> seenKeys, String key, String value, String unit, int displayOrder) {
        String val = value == null ? "" : value.trim();
        if (val.isBlank() || "-".equals(val) || !seenKeys.add(key)) {
            return false;
        }
        val = val.length() > 255 ? val.substring(0, 255) : val;
        ProductSpec spec = productSpecRepository.findByProductIdAndSpecKey(productId, key).orElse(null);
        if (spec == null) {
            productSpecRepository.save(ProductSpec.create(productId, key, val, unit, displayOrder));
        } else {
            spec.editValue(val, unit);
            spec.changeDisplayOrder(displayOrder);
            productSpecRepository.save(spec);
        }
        return true;
    }

    private static String normalizeSpecValue(String rawValue, SpecValueMode mode) {
        return switch (mode) {
            case AS_IS -> rawValue == null ? "" : rawValue.trim();
            case NUMBER -> extractNumber(rawValue);
            case RANGE -> normRange(rawValue);
            case DIMENSION -> normDimension(rawValue);
        };
    }

    private static String extractNumber(String v) {
        if (v == null) return "";
        Matcher m = Pattern.compile("-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?").matcher(v);
        return m.find() ? m.group().replace(",", "") : "";
    }

    private static String normRange(String v) {
        return v == null ? "" : v.trim().replaceAll("\\s*/\\s*", "/");
    }

    private static String normDimension(String v) {
        if (v == null) return "";
        String trimmed = v.trim();
        String[] parts = trimmed.split("\\s*[xX×*]\\s*");
        if (parts.length != 3) {
            return trimmed;
        }
        return parts[0].trim() + "x" + parts[1].trim() + "x" + parts[2].trim();
    }

    private static Pair splitBar(String v) {
        String s = v == null ? "" : v;
        int pos = s.indexOf('|');
        if (pos < 0) return new Pair(s.trim(), "");
        return new Pair(s.substring(0, pos).trim(), s.substring(pos + 1).trim());
    }

    private static Pair splitSlash(String v) {
        String s = v == null ? "" : v;
        int pos = s.indexOf('/');
        if (pos < 0) return new Pair(s.trim(), "");
        return new Pair(s.substring(0, pos).trim(), s.substring(pos + 1).trim());
    }

    private static String normHeader(String h) {
        return h == null ? "" : h.trim().replaceAll("\\s+", "");
    }

    private static List<String> normalizedHeaders(List<String> header) {
        List<String> out = new ArrayList<>();
        for (String h : header) {
            out.add(normHeader(h));
        }
        return out;
    }

    private static int idx(List<String> normalizedHeader, String candidate) {
        String target = normHeader(candidate);
        for (int i = 0; i < normalizedHeader.size(); i++) {
            if (target.equals(normalizedHeader.get(i))) return i;
        }
        return -1;
    }

    private static int firstExistingIdx(List<String> normalizedHeader, String... candidates) {
        for (String candidate : candidates) {
            int i = idx(normalizedHeader, candidate);
            if (i >= 0) return i;
        }
        return -1;
    }

    private static List<Integer> validCols(int... cols) {
        List<Integer> out = new ArrayList<>();
        for (int col : cols) {
            if (col >= 0 && !out.contains(col)) {
                out.add(col);
            }
        }
        return out;
    }

    private static int firstNonBlankColumn(List<String> cells, List<Integer> cols) {
        for (Integer col : cols) {
            if (col == null || col < 0) {
                continue;
            }
            String value = cell(cells, col);
            if (!value.isBlank() && !"-".equals(value)) {
                return col;
            }
        }
        return -1;
    }

    private static int findContainsNorm(List<String> normalizedHeader, String needle) {
        String target = normHeader(needle);
        for (int i = 0; i < normalizedHeader.size(); i++) {
            if (normalizedHeader.get(i).contains(target)) return i;
        }
        return -1;
    }

    private static int findContainsRaw(List<String> header, Pattern pattern) {
        for (int i = 0; i < header.size(); i++) {
            if (pattern.matcher(header.get(i) == null ? "" : header.get(i)).find()) return i;
        }
        return -1;
    }

    private static List<Integer> collectRawContains(List<String> header, Pattern pattern) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < header.size(); i++) {
            if (pattern.matcher(header.get(i) == null ? "" : header.get(i)).find()) {
                out.add(i);
            }
        }
        return out;
    }

    private static List<ColumnGroup> commercialGroups(List<String> header) {
        List<ColumnGroup> groups = new ArrayList<>();
        ColumnGroup current = null;
        for (int i = 0; i < header.size(); i++) {
            String raw = header.get(i) == null ? "" : header.get(i);
            String type = null;
            if (Pattern.compile("냉방\\s*성능").matcher(raw).find()) type = "coolCap";
            else if (Pattern.compile("난방\\s*성능").matcher(raw).find()) type = "heatCap";
            else if (Pattern.compile("소비\\s*전력").matcher(raw).find()) type = "power";

            if (type == null) {
                current = null;
            } else if (current == null || !current.type().equals(type)) {
                List<Integer> cols = new ArrayList<>();
                cols.add(i);
                current = new ColumnGroup(type, cols);
                groups.add(current);
            } else {
                current.cols().add(i);
            }
        }
        return groups;
    }

    private static String joinCols(List<String> cells, List<Integer> cols) {
        List<String> values = new ArrayList<>();
        for (Integer col : cols) {
            String v = cell(cells, col);
            if (!v.isBlank()) {
                values.add(v);
            }
        }
        return String.join(" / ", values);
    }

    /**
     * 가격/금액성 헤더 차단(보조) — SPEC_EXCLUDE 명시 누락분(소비자가/단가/금액/합계 등 변형 표기)이
     * 사양으로 새지 않도록. '소비전력'·'에너지소비효율' 등 사양 키워드는 미매칭(소비'자가' 아님).
     */
    private static boolean isPriceLikeHeader(String h) {
        return h.matches(".*(가격|단가|금액|합계|총액|정가|소비자가|부가세|VAT).*");
    }

    /** 구성품 탭 헤더 탐색 — '세트' AND '모델' 포함 행(상위 10행). */
    private int findComponentHeaderRow(List<List<Object>> rows) {
        for (int i = 0; i < Math.min(10, rows.size()); i++) {
            List<String> r = GoogleSheetsClient.toStringRow(rows.get(i), 30);
            String joined = String.join("", r).replaceAll("\\s+", "");
            if (joined.contains("세트") && (joined.contains("모델") || joined.contains("기종"))) {
                return i;
            }
        }
        return -1;
    }

    /** 헤더 이름(공백제거 완전일치) → 컬럼 인덱스. legacy findIdx_ 정합. 없으면 -1. */
    private static int findColumnByHeader(List<String> header, List<String> candidates) {
        for (int i = 0; i < header.size(); i++) {
            String h = header.get(i) == null ? "" : header.get(i).replaceAll("\\s+", "");
            for (String cand : candidates) {
                if (h.equals(cand)) return i;
            }
        }
        return -1;
    }

    /**
     * 구분/이름/특징 → ComponentKind. legacy isRemote/isPanel/isFoot/isMaterial 정합.
     * 구분(kindRaw) 컬럼이 1순위 권위 — 명시되면 그것으로 판정하고, 미매칭 시에만 name+variant fallback.
     */
    private static BundleComponent.ComponentKind mapComponentKind(String kindRaw, String name, String variant) {
        BundleComponent.ComponentKind fromKind = matchKind(kindRaw == null ? "" : kindRaw);
        if (fromKind != BundleComponent.ComponentKind.ACCESSORY) {
            return fromKind;
        }
        return matchKind((name == null ? "" : name) + " " + (variant == null ? "" : variant));
    }

    private static BundleComponent.ComponentKind matchKind(String s) {
        if (s.matches(".*(리모컨|리모콘).*")) return BundleComponent.ComponentKind.REMOTE;
        if (s.matches(".*(판넬|판널|패널).*")) return BundleComponent.ComponentKind.PANEL;
        if (s.contains("발통")) return BundleComponent.ComponentKind.FOOT;
        if (s.contains("실내")) return BundleComponent.ComponentKind.INDOOR;
        if (s.contains("실외")) return BundleComponent.ComponentKind.OUTDOOR;
        if (s.contains("자재")) return BundleComponent.ComponentKind.MATERIAL;
        return BundleComponent.ComponentKind.ACCESSORY;
    }

    /**
     * KEEP(통째 발송) 세트 판정 — legacy SEND_AS_SET_IDS 패턴.
     * 유선보드(AIM-A01N)/실링 드레인펌프/발통세트/SI-AL700a.
     */
    private static boolean isKeepSet(String modelCode, String name) {
        String m = modelCode == null ? "" : modelCode;
        String n = name == null ? "" : name;
        if (m.matches("(?i).*AIM-?A01N.*") || n.contains("유선보드")) return true;
        if (n.contains("드레인펌프") && n.contains("실링")) return true;
        if (m.contains("발통세트") || n.contains("발통세트")) return true;
        if (m.matches("(?i).*SI-AL700a.*")) return true;
        return false;
    }

    /**
     * 구성품 수량 해석 — 전개 시 모두 세트수량에 비례(FOLLOW_SET). legacy explodeCommSets_ 정합:
     * 'Q' → finalQty=setQty(=FOLLOW_SET, defaultQty 1), 숫자 N → finalQty=setQty×N(=FOLLOW_SET, defaultQty N).
     * 싱글 구성품(수량 컬럼 없음)도 세트수량 그대로(FOLLOW_SET, 1). BundleExpander 의 FOLLOW_SET=setQty×defaultQty 와 정합.
     */
    private static QtyAndMode resolveQty(boolean hasQtyColumn, String qtyRaw) {
        if (!hasQtyColumn) {
            return new QtyAndMode(BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET);
        }
        String q = qtyRaw == null ? "" : qtyRaw.trim();
        if (q.isBlank() || q.equalsIgnoreCase("Q")) {
            return new QtyAndMode(BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET);
        }
        try {
            BigDecimal n = new BigDecimal(q.replace(",", ""));
            if (n.signum() <= 0) n = BigDecimal.ONE;
            return new QtyAndMode(n, BundleComponent.QtyMode.FOLLOW_SET);
        } catch (NumberFormatException e) {
            return new QtyAndMode(BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET);
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    /** 싱글 세트 평형(B열=idx 1) → pyong_size (legacy getSingleSets size 정합). 그 외 탭 무동작. */
    private static void applyPyongSize(Product p, SheetTabMapping mapping, List<String> cells) {
        if (mapping.productCategory != ProductCategory.SINGLE_SET) {
            return;
        }
        String raw = safeGet(cells, 1); // 싱글 세트 B열 = 평형
        if (raw == null || raw.isBlank()) {
            return;
        }
        String digits = raw.replaceAll("[^\\d.]", "");
        if (digits.isBlank()) {
            return;
        }
        try {
            p.changePyongSize(new BigDecimal(digits));
        } catch (NumberFormatException ignored) {
            // 비숫자 평형 표기 — skip
        }
    }

    private record QtyAndMode(BigDecimal qty, BundleComponent.QtyMode mode) {}

    /** 구성품 탭 매핑 record. hasQtyColumn = 상업멀티 구성(수량 컬럼 보유) 여부. */
    public record ComponentTabMapping(String tabName, boolean hasQtyColumn) {}

    /** 구성품 tab sync 결과. */
    public static class ComponentSyncResult {
        /** 수기 편집 보호로 건너뛴 구성품 행 수. */
        public int preservedManual = 0;
        public int linked = 0;
        public int bundlesMarked = 0;
        public int softDeleted = 0;
        public int skipped = 0;
        /**
         * 🚨 2026-07-28 재수렴 R6 결함 3 [MED] 계열 sweep — 이 부모(BUNDLE)를 source로
         * 갖는 활성 수량 동기화 규칙의 target을 자기 구성품으로 새로 연결하려다 거부된
         * (부모,자식) 행 수. {@link BundleComponentService#replaceComponents}와 같은
         * 불변식(I-3)을 시트 sync 경로에서도 지킨다.
         */
        public int blockedByRule = 0;
        public String error;
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
        String syncKey = sheetSyncKey("product:" + mapping.currentTabName);
        long syncGeneration = quantitySyncRuleService.reserveSheetSyncGeneration(syncKey);
        String range = mapping.currentTabName + "!A1:Z";
        String formulaRange = expandFormulaRange(range);
        // 🚨 2026-07-28 재수렴 R6 결함 4 [MED] fix (I-4) — lockGraphMutation()을 외부
        // Google Sheets HTTP 왕복(readSheetDisplay/readSheetFormulas) 이전이 아니라
        // 이후로 옮긴다. 이 락은 규칙 그래프/품목 상태를 건드리는 DB mutation 구간만
        // 직렬화하면 되고, 시트 read 자체는 그 어떤 quantity_sync 테이블도 만지지 않는다
        // — 이전 위치는 시트가 느리거나 무응답이면 정상 관리자의 품목 편집(update/
        // discontinue/delete/updateUsageAndReturn 전부 같은 advisory lock을 기다림)을
        // 그 대기시간만큼 인질로 잡았다(실측: 6초 지연 stub에서 566배 지연, 10.76초).
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
        // 사양 적재용 헤더 행을 1회 확보. 사양 보유 탭은 V17 매핑전용, 비사양 탭은 blocklist fallback.
        List<String> headerCells = isSpecBearing(mapping.productCategory)
                ? GoogleSheetsClient.toStringRow(rows.get(headerIdx), 30) : null;

        // #30 — 변동DC 4컬럼 적재: DISPLAY 값은 legacy 와 같은 A1:Z 를 유지하되, FORMULA 는
        // JS readSheetGrid 정답과 맞춰 A1:ZZ 로 넓혀 후행 수식 열을 보존한다. Sheets API
        // values 응답은 trailing empty cell 을 자르는 ragged row 이므로, modelCode 기반 매칭을
        // 우선하고 modelCode 셀이 수식인 예외에서는 동일 row index 를 fallback 으로 사용한다.
        // 수식 read 실패 시 가격 sync 는 계속(분기만 미적용).
        List<List<Object>> formulaRows = null;
        try {
            formulaRows = sheetsClient.readSheetFormulas(sheetId, formulaRange);
        } catch (Exception e) {
            log.warn("[ProductSheetSync] tab '{}' 수식 read 실패 — 변동DC 판정 skip: {}",
                    mapping.tabName, e.getMessage());
        }
        FormulaRowResolver formulaResolver = FormulaRowResolver.from(formulaRows, mapping.modelCodeColumn);
        // #구분/순서 — 시트 노출 순서(display_order): 탭 내 유효 데이터 행 순번(1부터).
        int displaySeq = 0;
        // 고정DC 컬럼(홈멀티/상업멀티) — 헤더명 기반.
        int fixedDcColumn = -1;
        {
            List<String> fullHeader = GoogleSheetsClient.toStringRow(rows.get(headerIdx), 30);
            fixedDcColumn = findColumnByHeader(fullHeader, List.of("고정DC"));
        }

        // 🚨 2026-07-28 재수렴 R6 결함 4 [MED] fix (I-4) — 여기부터가 실제로 규칙
        // 그래프/품목 상태를 건드리는 DB mutation 구간이다. 위의 모든 외부 HTTP(시트 read)와
        // 순수 로컬 파싱은 이 락 없이 끝났다.
        quantitySyncRuleService.lockGraphMutation();
        if (!quantitySyncRuleService.isCurrentSheetSyncGeneration(syncKey, syncGeneration)) {
            log.info("[ProductSheetSync] tab '{}' stale response skipped (generation={})",
                    mapping.tabName, syncGeneration);
            return result;
        }

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
            int displayOrder = ++displaySeq; // 시트 노출 순서(유효 데이터 행 순번)

            String rowHash = sha256(cells.subList(0, Math.min(8, cells.size())).toString());
            String prevHash = lastKnownRowHash.get(modelCode);
            BigDecimal releasePrice = parseDecimal(safeGet(cells, mapping.releasePriceColumn));
            BigDecimal deliveryPrice = parseDecimal(safeGet(cells, mapping.deliveryPriceColumn));

            // #30 — 변동DC 판정. useK2/matKey/구형 isDisc 마커는 단가 수식에만 출현하므로
            // 행 전체 수식을 join 한다. FORMULA 행은 modelCode 매칭 우선, 인덱스 fallback.
            String rowFormula = formulaResolver.joinFor(i, modelCode);
            boolean hasVariableDiscount = discountDetector.detectHasVariableDiscount(rowFormula);
            MaterialKey materialKey = discountDetector.detectMaterialKey(rowFormula).orElse(null);
            boolean legacyDiscount = mapping.productCategory == ProductCategory.OLD
                    && discountDetector.detectLegacyDiscount(rowFormula);
            BigDecimal fixedRate = legacyDiscount
                    ? discountDetector.legacyFixedDiscountRate()
                    : parseFixedDcRate(fixedDcColumn >= 0 ? safeGet(cells, fixedDcColumn) : null);
            String discountFlags = discountDetector.detectDiscountFlags(modelCode);
            ClassificationSet classifications = resolveClassifications(
                    classificationEstimateCategory(mapping), classifyName(mapping.productCategory, name, modelCode));

            // 노출 분류 홈 탭 불변식: TAB_MAPPINGS 는 견적 탭(홈멀티/싱글세트/상업멀티/구형)을
            // 구성품 탭(싱글구성품/상업멀티구성)보다 먼저 처리한다(L96-115 순서 고정). 따라서 품목의
            // 최초 insert = 견적 탭 → productCategory 가 견적 카테고리로 고정되고, 이후 구성품 탭의
            // update 는 아래 가드(productCategory 불일치)로 usageScope/display_order 미변경.
            // 구성품 탭에만 존재하는 모델은 SINGLE_PART/NONE 으로 insert 됨이 정상(노출 비대상).
            // ※ 신규 탭 추가 시 견적 탭은 구성품 탭보다 앞에 둘 것.
            Optional<Product> existing = productRepository.findByModelCodeAndIsDeletedFalse(modelCode);
            UUID productId;
            Product productForExposure;
            if (existing.isEmpty()) {
                Product p = Product.seedFromSheet(name, modelCode, defaultCategory,
                        releasePrice, deliveryPrice,
                        ProductType.SINGLE,
                        mapping.productCategory,
                        mapping.usageScope,
                        mapping.estimateCategory);
                p.applyDiscountRules(hasVariableDiscount, materialKey, legacyDiscount, fixedRate);
                p.changeDiscountFlags(discountFlags);
                p.changeClassifications(classifications.catL(), classifications.catM(), classifications.catS());
                applyAttributes(p, name, modelCode);
                applyPyongSize(p, mapping, cells);
                productRepository.save(p);
                upsertPriceHistory(p.getId(), PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                lastKnownRowHash.put(modelCode, rowHash);
                productId = p.getId();
                productForExposure = p;
                result.inserted++;
            } else if (prevHash == null || !prevHash.equals(rowHash)) {
                Product p = existing.get();
                p.changePrices(releasePrice, deliveryPrice);
                // ECOUNT-first 행은 최초 생성 시 productCategory/usageScope가 비어 있다.
                // 시트에 같은 modelCode가 등장한 순간 시트를 정본으로 채택하고, 아래의
                // 기존 홈 탭 분류·노출 갱신 경로를 그대로 태운다. MANUAL/SHEET 행은
                // 기존 가드를 유지한다.
                boolean promotedFromEcount = p.promoteEcountToSheet();
                // 노출 분류(usageScope/estimateCategory/display_order)는 품목의 '홈 탭'(최초
                // productCategory 일치 탭)에서만 설정 — 다른 탭(예: 싱글세트가 구성품 탭에 재출현)이
                // NONE/다른 순번으로 덮어쓰는 stomping 방지(2026-06-10 노출구분 결정). 가격/사양은
                // 어느 탭에서든 갱신(단가인상 탭 권위).
                // 변동DC 는 productCategory 일치 견적 탭에서만 갱신(구성품·겹침 탭 덮어쓰기 방지)하며
                // variableDiscountManual=true 면 hasVariableDiscount/materialKey/legacy/fixedRate/
                // discountFlags 를 모두 sync 동결한다. 변동DC override 가 부속 할인필드 동결을
                // 동반하는 의도된 단순화다.
                //
                // V14 수동 override 보존 가드 (2026-06-11 PR-B):
                //   usageScopeManual=true 인 품목은 usageScope/estimateCategory 를 시트 기준으로
                //   덮어쓰지 않는다.
                //   displayOrder 는 '홈 탭' update 분기 진입 시 갱신한다 (지적 [8], PR-B 2026-06-11).
                //   manual 여부와 무관하게 갱신 — 사용자가 시트 행 순서를 재정렬해도 반영되어야 함.
                if (p.getProductCategory() == mapping.productCategory || promotedFromEcount) {
                    if (promotedFromEcount) {
                        p.rename(name);
                        p.changeProductCategory(mapping.productCategory);
                    }
                    if (!p.isUsageScopeManual()) {
                        // 🚨 2026-07-28 재수렴 R6 결함 5 [MED] fix (I-5) — override 해제
                        // (usageScopeManual=false) 상태에서 이 탭 매핑이 usageScope를 NONE
                        // 으로 되돌리면 활성 규칙이 참조하는 품목의 노출이 조용히 꺼진다
                        // (같은 품목을 PATCH .../usage {"usageScope":"NONE"}로 직접 바꾸려
                        // 하면 409로 막히는 것과 같은 상태). 자동 배치 경로라 예외를 던져
                        // 전체 sync를 실패시키지 않고, soft-delete 가드(아래 :~1300)와 같은
                        // 패턴으로 이 필드 갱신만 보류하고 로그+카운터로 남긴다. NONE이 아닌
                        // 값(BOTH/ESTIMATE/PARTNER_ORDER)으로의 전환은 visible을 끄지
                        // 않으므로 이 가드 대상이 아니다.
                        boolean losesVisibility = mapping.usageScope == UsageScope.NONE
                                && p.getUsageScope() != UsageScope.NONE;
                        List<String> blockingRuleKeys = losesVisibility
                                ? quantitySyncRuleService.findEnabledRuleKeysReferencing(p.getId())
                                : List.of();
                        if (!blockingRuleKeys.isEmpty()) {
                            log.warn("[ProductSheetSync] tab '{}' modelCode='{}' → 활성 수량 동기화 규칙({})"
                                            + " 참조로 usageScope NONE 전환 보류",
                                    mapping.tabName, modelCode, String.join(", ", blockingRuleKeys));
                            result.preservedByRule++;
                        } else {
                            p.changeUsage(mapping.usageScope);
                        }
                    }
                    if (!p.isVariableDiscountManual()) {
                        BigDecimal nextFixedRate = p.isFixedDiscountManual() ? p.getFixedDiscountRate() : fixedRate;
                        p.applyDiscountRules(hasVariableDiscount, materialKey, legacyDiscount, nextFixedRate);
                        p.changeDiscountFlags(discountFlags);
                    }
                    if (!p.isClassificationManual()) {
                        p.changeClassifications(classifications.catL(), classifications.catM(), classifications.catS());
                    }
                    applyAttributes(p, name, modelCode);
                    applyPyongSize(p, mapping, cells);
                }
                productRepository.save(p);
                upsertPriceHistory(p.getId(), PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                lastKnownRowHash.put(modelCode, rowHash);
                productId = p.getId();
                productForExposure = p;
                result.updated++;
            } else {
                Product p = existing.get();
                if (p.getProductCategory() == mapping.productCategory && applyAttributes(p, name, modelCode)) {
                    productRepository.save(p);
                    lastKnownRowHash.put(modelCode, rowHash);
                    productId = p.getId();
                    productForExposure = p;
                    upsertPriceHistory(productId, PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                    result.updated++;
                } else {
                    productId = p.getId();
                    productForExposure = p;
                    upsertPriceHistory(productId, PRICE_INCREASE_EFFECTIVE_DATE, releasePrice, deliveryPrice);
                    result.unchanged++;
                }
            }

            upsertSheetExposure(productForExposure, mapping.estimateCategory, displayOrder);

            // 사양(ProductSpec) 적재 — 사양 보유 탭은 V17 매핑전용, 비사양 탭은 기존 blocklist 보존.
            if (headerCells != null) {
                result.specsLinked += loadSpecsForProduct(productId, headerCells, cells, mapping);
            }
        }

        syncBeforeIncreasePriceHistory(mapping, sheetModelCodes);

        // soft-delete: DB 의 같은 productCategory row 중 시트에서 사라진 것.
        // usageScopeManual=true 인 품목은 시트 부재 시에도 soft-delete 제외 — 개발책임자 결정
        // "시트에 없는 품목도 수동 노출 가능" 에 부합 (PR-B 2026-06-11, 지적 [4]).
        List<Product> dbProducts = productRepository.findByProductCategoryAndIsDeletedFalse(mapping.productCategory);
        for (Product p : dbProducts) {
            String code = p.getModelCode();
            if (code == null) continue;
            if (!sheetModelCodes.contains(code)) {
                if (p.isUsageScopeManual()) {
                    // 수동 override 품목 — 시트에 없어도 삭제 보호 (별도 카운터 preservedManual 사용, 사이클2 지적 P3-6)
                    log.debug("[ProductSheetSync] tab '{}' modelCode='{}' usageScopeManual=true → soft-delete 제외",
                            mapping.tabName, code);
                    result.preservedManual++;
                    continue;
                }
                List<String> ruleKeys = quantitySyncRuleService.findEnabledRuleKeysReferencing(p.getId());
                if (!ruleKeys.isEmpty()) {
                    log.warn("[ProductSheetSync] tab '{}' modelCode='{}' → 활성 수량 동기화 규칙 참조({})로 soft-delete 제외",
                            mapping.tabName, code, String.join(", ", ruleKeys));
                    continue;
                }
                if (ecountAliasReservationService.hasActiveReservation(p.getId())) {
                    log.info("[ProductSheetSync] tab '{}' modelCode='{}' → MIG-8 alias reservation active; soft-delete 보류",
                            mapping.tabName, code);
                    result.deferredByEcountReservation++;
                    continue;
                }
                // BaseEntity.markDeleted: deletedAt + deletedBy + isDeleted=true 설정 (shared:common).
                String actor = "system-sheet-sync";
                p.markDeleted(actor);
                productRepository.save(p);
                softDeleteExposures(p.getId(), actor);
                lastKnownRowHash.remove(code);
                result.softDeleted++;
            }
        }

        log.info("[ProductSheetSync] tab '{}': inserted={}, updated={}, unchanged={}, softDeleted={}, skipped={}, preservedManual={}",
                mapping.tabName, result.inserted, result.updated, result.unchanged,
                result.softDeleted, result.skipped, result.preservedManual);
        return result;
    }

    /**
     * 시트 탭 기준 견적 노출을 additive upsert 한다.
     *
     * <p>수동 override 품목은 PATCH /usage 가 단일 권위이므로 sync 에서 노출을 변경하지 않는다.
     * sync 는 삭제를 절대 수행하지 않고, 탭에 등장한 카테고리 행을 보장하거나 displayOrder 만 갱신한다.
     */
    private void upsertSheetExposure(Product product, EstimateCategory estimateCategory, int displayOrder) {
        if (product == null || product.getId() == null || estimateCategory == null) {
            return;
        }
        if (product.isUsageScopeManual()) {
            return;
        }
        exposureRepository.findByProductIdAndEstimateCategoryAndIsDeletedFalse(product.getId(), estimateCategory)
                .ifPresentOrElse(
                        exposure -> {
                            // syncTab self-invocation 경로는 활성 트랜잭션이 없어 dirty checking 미적용 →
                            // display_order 변경을 명시 save 로 flush (P1, [[self-invocation-transactional-bypass]]).
                            exposure.changeDisplayOrder(displayOrder);
                            exposureRepository.save(exposure);
                        },
                        () -> exposureRepository.save(ProductEstimateExposure.create(
                                product.getId(), estimateCategory, displayOrder)));
    }

    private boolean applyAttributes(Product product, String name, String modelCode) {
        String panelType = attributeClassifier.classifyPanelType(name, modelCode);
        String remoteType = attributeClassifier.classifyRemoteType(name);
        if (Objects.equals(product.getPanelType(), panelType)
                && Objects.equals(product.getRemoteType(), remoteType)) {
            return false;
        }
        product.changeAttributes(panelType, remoteType);
        return true;
    }

    private void softDeleteExposures(UUID productId, String actor) {
        if (productId == null) {
            return;
        }
        List<ProductEstimateExposure> exposures = exposureRepository.findByProductIdAndIsDeletedFalse(productId);
        for (ProductEstimateExposure exposure : exposures) {
            exposure.markDeleted(actor);
            exposureRepository.save(exposure);
        }
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
        return idx >= 0 && idx < cells.size() ? cells.get(idx) : "";
    }

    private static String cell(List<String> cells, int idx) {
        return safeGet(cells, idx).trim();
    }

    /**
     * DISPLAY row 와 동일 인덱스의 FORMULA row 에서 '=' 시작 셀을 공백 join (fallback/진단용).
     *
     * <p>DISPLAY(A1:Z) 와 FORMULA(A1:ZZ) read range 가 달라 trailing 행 절단 양상이 다를 수 있다.
     * 변동DC 판정은 modelCode 매칭 결과를 우선 사용하므로, 인덱스 fallback 은 modelCode 셀 자체가
     * 수식이라 매칭할 수 없는 예외 행의 진단/보조 경로로만 쓰인다.
     */
    private static String joinRowFormulas(List<List<Object>> formulaRows, int rowIdx) {
        if (formulaRows == null || rowIdx >= formulaRows.size()) {
            return "";
        }
        List<Object> row = formulaRows.get(rowIdx);
        return joinFormulaCells(row);
    }

    /** FORMULA row 전체에서 수식 셀만 공백으로 join 한다. 멀티라인 LET 수식은 문자열 그대로 보존한다. */
    private static String joinFormulaCells(List<Object> row) {
        if (row == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Object cell : row) {
            if (cell == null) continue;
            String v = cell.toString().stripLeading();
            if (v.startsWith("=")) sb.append(v).append(' ');
        }
        return sb.toString();
    }

    /** DISPLAY read 범위(A1:Z)를 FORMULA read 범위(A1:ZZ)로 확장한다. */
    private static String expandFormulaRange(String displayRange) {
        if (displayRange == null || displayRange.isBlank()) {
            return displayRange;
        }
        int colon = displayRange.lastIndexOf(':');
        if (colon < 0) {
            return displayRange;
        }
        return displayRange.substring(0, colon + 1) + FORMULA_RANGE_END_COLUMN;
    }

    /**
     * FORMULA row 매칭기.
     *
     * <p>정상 시트는 DISPLAY/FORMULA row index 가 같지만, Google Sheets values API 는 빈
     * trailing row/cell 을 잘라 ragged row 로 반환한다. 모델코드 셀이 일반 값이면 모델코드로
     * 직접 매칭하고, 모델코드 셀 자체가 수식이라 키를 만들 수 없는 경우만 기존 index fallback 을 쓴다.
     */
    private static final class FormulaRowResolver {
        private final List<List<Object>> formulaRows;
        private final Map<String, List<Object>> rowsByModelCode;

        private FormulaRowResolver(List<List<Object>> formulaRows, Map<String, List<Object>> rowsByModelCode) {
            this.formulaRows = formulaRows;
            this.rowsByModelCode = rowsByModelCode;
        }

        static FormulaRowResolver from(List<List<Object>> formulaRows, int modelCodeColumn) {
            Map<String, List<Object>> rowsByModelCode = new HashMap<>();
            if (formulaRows != null && modelCodeColumn >= 0) {
                for (List<Object> row : formulaRows) {
                    String modelCode = rawCell(row, modelCodeColumn).trim();
                    if (!modelCode.isBlank() && !modelCode.startsWith("=")) {
                        rowsByModelCode.putIfAbsent(modelCode, row);
                    }
                }
            }
            return new FormulaRowResolver(formulaRows, rowsByModelCode);
        }

        String joinFor(int displayRowIdx, String modelCode) {
            if (modelCode != null && !modelCode.isBlank()) {
                List<Object> byModel = rowsByModelCode.get(modelCode);
                if (byModel != null) {
                    return joinFormulaCells(byModel);
                }
            }
            return joinRowFormulas(formulaRows, displayRowIdx);
        }
    }

    private static String rawCell(List<Object> row, int idx) {
        Object value = row != null && idx >= 0 && idx < row.size() ? row.get(idx) : null;
        return value == null ? "" : value.toString();
    }

    /**
     * 고정DC 셀 → percent (0~100). "50%" / "50" / "0.5" 모두 50 으로 정규화.
     * 빈/비숫자 → null.
     */
    private static BigDecimal parseFixedDcRate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("-?\\d+(?:\\.\\d+)?").matcher(raw);
        if (!m.find()) {
            return null;
        }
        BigDecimal v = new BigDecimal(m.group());
        if (raw.contains("%")) {
            // 이미 percent 표기.
        } else if (v.compareTo(BigDecimal.ZERO) > 0 && v.compareTo(BigDecimal.ONE) <= 0) {
            v = v.multiply(new BigDecimal("100"));
        }
        if (v.signum() < 0) {
            v = v.abs();
        }
        BigDecimal cap = new BigDecimal("100");
        return v.min(cap).setScale(2, java.math.RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private EstimateCategory classificationEstimateCategory(SheetTabMapping mapping) {
        return switch (mapping.productCategory) {
            case HOME_MULTI -> EstimateCategory.HOME_MULTI;
            case SINGLE_SET, SINGLE_PART -> EstimateCategory.SINGLE_SET;
            case COMMERCIAL_MULTI, COMMERCIAL_PART -> EstimateCategory.COMMERCIAL_MULTI;
            case OLD -> EstimateCategory.LEGACY;
            case MATERIAL -> EstimateCategory.OTHER;
        };
    }

    private ClassificationSet resolveClassifications(EstimateCategory estimateCategory, ClassificationNames names) {
        if (names == null || names.catL() == null || names.catL().isBlank()) {
            return new ClassificationSet(null, null, null);
        }
        Classification catL = findOrCreateClassification(
                estimateCategory, Classification.CatLevel.L, null, names.catL());
        Classification catM = names.catM() == null || names.catM().isBlank()
                ? null
                : findOrCreateClassification(estimateCategory, Classification.CatLevel.M, catL, names.catM());
        Classification catS = catM == null || names.catS() == null || names.catS().isBlank()
                ? null
                : findOrCreateClassification(estimateCategory, Classification.CatLevel.S, catM, names.catS());
        return new ClassificationSet(catL, catM, catS);
    }

    private Classification findOrCreateClassification(EstimateCategory estimateCategory,
                                                      Classification.CatLevel level,
                                                      Classification parent,
                                                      String name) {
        String normalized = name == null ? "" : name.trim();
        Optional<Classification> existing = parent == null
                ? classificationRepository.findByEstimateCategoryAndCatLevelAndNameAndIsDeletedFalse(
                        estimateCategory, level, normalized)
                : classificationRepository.findByEstimateCategoryAndCatLevelAndParent_IdAndNameAndIsDeletedFalse(
                        estimateCategory, level, parent.getId(), normalized);
        if (existing.isPresent()) {
            return existing.get();
        }
        int nextOrder = classificationRepository.maxDisplayOrder(
                estimateCategory, level, parent == null ? null : parent.getId()) + 1;
        return classificationRepository.save(Classification.create(
                estimateCategory, level, parent, normalized, nextOrder, true));
    }

    private static ClassificationNames classifyName(ProductCategory productCategory, String name, String modelCode) {
        if (productCategory == ProductCategory.COMMERCIAL_MULTI
                || productCategory == ProductCategory.COMMERCIAL_PART) {
            return classifyCommercial(name, modelCode);
        }
        if (productCategory == ProductCategory.SINGLE_SET
                || productCategory == ProductCategory.SINGLE_PART) {
            return classifySingleSet(name, modelCode);
        }
        return classifyHome(name);
    }

    private static ClassificationNames classifyHome(String rawName) {
        String n = rawName == null ? "" : rawName.trim();
        if (matches(n, "원형\\s*발통|발통\\s*세트|받침대|일자발|평발|플랫")) {
            String catM = matches(n, "원형|발통") ? "원형발통"
                    : matches(n, "일자발|평발|플랫") ? "일자발" : "";
            return new ClassificationNames("실외기 받침대", catM, "");
        }
        if (matches(n, "전열\\s*교환기|에어콤보|에어콤포")) {
            return new ClassificationNames("전열교환기",
                    matches(n, "에어콤보|에어콤포") ? "에어콤보" : "", "");
        }
        if (matches(n, "인테리어\\s*핏|인테리어핏")) {
            return new ClassificationNames("인테리어핏", "", "");
        }
        if (matches(n, "시스템\\s*제습기|제습기") && !matches(n, "가정용")) {
            return new ClassificationNames("시스템제습기", "", "");
        }
        if (matches(n, "^실외기|[\\s_\\-]실외기")) {
            String catM = matches(n, "단배관") ? "단배관" : matches(n, "다배관") ? "다배관" : "";
            return new ClassificationNames("실외기", catM, "");
        }
        if (matches(n, "^실내기|[\\s_\\-]실내기|벽걸이")) {
            String catM = "";
            if (matches(n, "1\\s*-?\\s*Way")) {
                if (matches(n, "WIFI\\s*내장")) catM = "1-Way WIFI";
                else if (matches(n, "인피니트\\s*UV")) catM = "1-Way 인피니트UV";
                else if (matches(n, "인피니트")) catM = "1-Way 인피니트";
                else catM = "1-Way 미내장";
            } else if (matches(n, "4\\s*WAY|4\\s*-?\\s*Way")) {
                catM = matches(n, "WIFI\\s*내장") ? "4WAY WIFI" : "4WAY 미내장";
            } else if (matches(n, "360\\s*CST")) {
                catM = matches(n, "WIFI") ? "360 WIFI" : "360 미내장";
            } else if (matches(n, "벽걸이")) {
                catM = "벽걸이";
            }
            String catS = matches(n, "소형") ? "소형" : matches(n, "중형") ? "중형"
                    : matches(n, "대형") ? "대형" : "";
            return new ClassificationNames("실내기", catM, catS);
        }
        if (matches(n, "판넬|패널")) {
            String catM = "";
            if (matches(n, "공기청정|공청") && matches(n, "WIFI")) catM = "공기청정 WIFI";
            else if (matches(n, "공기청정|공청") && matches(n, "미내장")) catM = "공기청정 미내장";
            else if (matches(n, "WIFI")) catM = "WIFI";
            else if (matches(n, "미내장")) catM = "미내장";
            else if (matches(n, "인피니트")) catM = "인피니트";
            return new ClassificationNames("판넬", catM, "");
        }
        String catM;
        if (matches(n, "리모컨|리모콘")) catM = "리모컨";
        else if (matches(n, "분\\s*기\\s*관|분기관")) catM = "분기관";
        else if (matches(n, "유연호스")) catM = "유연호스";
        else catM = "기타";
        return new ClassificationNames("부자재", catM, "");
    }

    private static ClassificationNames classifySingleSet(String name, String modelCode) {
        // GAS classifySingleSetFixed(s) parity: BE 호출 계약에는 spec 이 없어 name/model 결합만 사용한다.
        String hay = ((name == null ? "" : name) + " " + (modelCode == null ? "" : modelCode))
                .toLowerCase(java.util.Locale.ROOT);
        String model = modelCode == null ? "" : modelCode.trim();
        if (matches(model, "^ADP-F075SP$")) {
            return new ClassificationNames("부자재", "", "");
        }

        boolean isCoolOnly = matches(hay, "냉방전용|냉전");
        boolean isHeatCool = matches(hay, "냉난방");
        String catL = "기타";
        String catM = "";

        if (matches(hay, "발통|일자발|받침")) {
            catL = "실외기 받침";
        } else if (matches(hay, "360|cst")) {
            catL = "360";
            if (matches(hay, "cst\\s*uv|uv")) catM = "CST UV";
        } else if (matches(hay, "4\\s*way|4way")) {
            if (isHeatCool) catL = "4way 냉난방";
            else if (isCoolOnly) catL = "4way 냉방전용";
            if (catL.equals("4way 냉난방")) {
                if (matches(hay, "프레스티지")) catM = "프레스티지";
                else if (matches(hay, "프리미엄|디럭스")) catM = "프리미엄/디럭스";
                else if (matches(hay, "1\\s*등급")) catM = "1등급";
            }
        } else if (matches(hay, "1\\s*way|1way")) {
            if (isHeatCool) catL = "1way 냉난방";
            else if (isCoolOnly) catL = "1way 냉방전용";
        } else if (matches(hay, "덕트|duct")) {
            catL = "덕트";
        } else if (matches(hay, "실링")) {
            catL = "실링";
        } else if (matches(hay, "스탠드")) {
            if (matches(hay, "비스포크")) {
                catL = "비스포크 스탠드";
                if (matches(hay, "콰이엇\\s*그레이")) catM = "콰이엇 그레이";
                else if (matches(hay, "세이지\\s*블루")) catM = "세이지 블루";
                else if (matches(hay, "프라임\\s*핑크")) catM = "프라임 핑크";
            } else if (isHeatCool) {
                catL = "냉난방 스탠드";
                if (matches(hay, "프레스티지")) catM = "프레스티지";
                else if (matches(hay, "프리미엄|디럭스")) catM = "프리미엄/디럭스";
                else if (matches(hay, "1\\s*등급")) catM = "1등급";
            } else if (isCoolOnly) {
                catL = "냉전 스탠드";
                if (matches(hay, "프레스티지")) catM = "프레스티지";
            }
        } else if (matches(hay, "벽걸이")) {
            if (isHeatCool) {
                catL = "냉난방 벽걸이";
                if (matches(hay, "무풍")) catM = "무풍";
            } else if (isCoolOnly) {
                catL = "냉전 벽걸이";
                catM = matches(hay, "무풍") ? "무풍" : "일반";
            }
        } else if (matches(hay, "가정용")) {
            boolean isPro = matches(hay,
                    "무풍\\s*콤보\\s*갤러리\\s*프로|콤보\\s*갤러리\\s*프로|"
                            + "무풍\\s*ai\\s*콤보\\s*프로|ai\\s*콤보\\s*프로");
            boolean isGallery = matches(hay, "무풍갤러리");
            boolean isClassic = matches(hay, "무풍클래식");
            boolean isQ9000 = matches(hay, "q9000");

            catL = "가정용 에어컨";
            if (isPro) catM = "무풍콤보 갤러리프로";
            else if (isQ9000) catM = "Q9000";
            else if (isClassic) catM = "무풍클래식";
            else if (isGallery) catM = "무풍갤러리";
            else catM = "24년형";
        }

        if (catL.equals("기타") && matches(hay,
                "kit|키트|중계기|리모컨|유연호스|드레인펌프|유선보드|board|보드|멀티\\s*wifi")) {
            catL = "부자재";
        }
        return new ClassificationNames(unifyCatL(catL), catM, "");
    }

    private static ClassificationNames classifyCommercial(String name, String modelCode) {
        String n = name == null ? "" : name.trim();
        String m = modelCode == null ? "" : modelCode.trim();
        if (n.contains("분기관")) {
            return new ClassificationNames("부자재", "분기관", "");
        }
        String catL = "";
        String catM = "";
        String catS = "";
        boolean isOutdoorByModel = Pattern.compile("AM\\d{3}A[XVH]|AXV|AXH|AXX", Pattern.CASE_INSENSITIVE)
                .matcher(m).find();
        boolean isIndoorByModel = Pattern.compile("AM\\d{3}(BN|CN|PB|PH|PN)", Pattern.CASE_INSENSITIVE)
                .matcher(m).find();

        if (matches(n, "프\\s*라임|프라임")) {
            catL = "실외기"; catM = "프라임";
        } else if (matches(n, "고효율.*한랭지")) {
            catL = "실외기"; catM = "고효율한랭지";
        } else if (matches(n, "표준형")) {
            catL = "실외기"; catM = "표준형";
        } else if (matches(n, "ECO.*냉난방")) {
            catL = "실외기"; catM = "ECO 냉난방";
        } else if (matches(n, "ECO.*냉방전용")) {
            catL = "실외기"; catM = "ECO 냉방전용";
        } else if (matches(n, "리뉴얼")) {
            catL = "실외기"; catM = "ECO 리뉴얼";
        } else if (matches(n, "냉방전용")) {
            catL = "실외기"; catM = "냉방전용";
        }

        if (catM.isBlank()) {
            if (matches(n, "\\b1\\s*-?\\s*Way\\b|1WAY")) {
                catL = "실내기";
                catM = matches(n, "WIFI") ? "1-Way WIFI내장"
                        : matches(n, "인피니트") ? "1-Way 인피니트" : "1WAY 미내장";
            } else if (matches(n, "\\b2\\s*Way\\b|2Way")) {
                catL = "실내기"; catM = "2Way";
            } else if (matches(n, "\\b4\\s*-?\\s*Way\\b|4Way")) {
                catL = "실내기";
                catM = matches(n, "UV-?C") && matches(n, "WIFI") ? "4-Way UV-C WIFI내장"
                        : matches(n, "MINI") && matches(n, "WIFI") ? "MINI 4WAY WIFI내장"
                        : matches(n, "WIFI") ? "4-Way WIFI내장"
                        : matches(n, "MINI") ? "MINI 4WAY 미내장" : "4WAY 미내장";
            } else if (matches(n, "360\\s*CST|360CST")) {
                catL = "실내기"; catM = matches(n, "WIFI") ? "360CST WIFI내장" : "360CST 미내장";
            } else if (matches(n, "벽걸이")) {
                catL = "실내기"; catM = "벽걸이";
            } else if (matches(n, "스탠드|PAC")) {
                catL = "실내기"; catM = "스탠드형(PAC)";
            } else if (matches(n, "실링")) {
                catL = "실내기"; catM = "실링";
            } else if (matches(n, "DUCT")) {
                catL = "실내기"; catM = "DUCT";
            } else if (matches(n, "전열\\s*교환기")) {
                catL = "실내기"; catM = "전열교환기";
            }
        }
        if (catL.isBlank()) {
            if (isOutdoorByModel || matches(n, "실외기|DVM\\s*(S2|ECO)")) catL = "실외기";
            else if (isIndoorByModel || matches(n, "실내기")) catL = "실내기";
        }
        if (catM.equals("1-Way WIFI내장") || catM.equals("1-Way 인피니트") || catM.equals("1WAY 미내장")) {
            if (matches(n, "소형")) catS = "소형";
            else if (matches(n, "대형")) catS = "대형";
            else catS = "중형";
        }
        if (catM.equals("DUCT")) {
            if (matches(n, "저정압.*SLIM")) catS = "저정압 SLIM";
            else if (matches(n, "중정압")) catS = "중정압";
            else if (matches(n, "고정압")) catS = "고정압";
        }
        if (catM.equals("전열교환기")) {
            if (matches(n, "상업용")) catS = "상업용";
            else if (matches(n, "주택용")) catS = "주택용";
        }
        if (catL.equals("실외기") && catM.startsWith("ECO")) {
            if (matches(n, "단상형")) catS = "단상형";
            else if (matches(n, "삼상형")) catS = "삼상형";
            else if (matches(n, "상부\\s*토출형|상부토출형")) catS = "상부토출형";
        }
        if (catL.isBlank() && matches(n, "판넬|패널|panel")) {
            catL = "판넬";
        }
        if (catL.isBlank()) {
            catL = "부자재";
        }
        return new ClassificationNames(catL, catM, catS);
    }

    private static String unifyCatL(String catL) {
        String normalized = catL == null ? "" : catL.trim();
        return normalized.equals("부자재2") ? "부자재" : normalized;
    }

    private static boolean matches(String value, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
                .matcher(value == null ? "" : value)
                .find();
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
     * 특정 modelCode 의 rowHash 캐시 무효화 — 수동 override 해제 시 호출.
     *
     * <p>인메모리 {@link #lastKnownRowHash} 에서 해당 모델의 hash 를 제거하여
     * 다음 sync 에서 {@code unchanged} 분기를 건너뛰고 usageScope/estimateCategory 를
     * 시트 기준으로 재분류하도록 강제한다 (지적 [2], PR-B 2026-06-11).
     *
     * <p>시트 행 내용이 바뀌지 않았어도 override 해제 후 반드시 재분류가 필요하므로
     * hash 자체를 제거한다. 제거 후 다음 sync = 신규 insert 가 아닌 hash miss → update 경로.
     *
     * @param modelCode override 해제된 품목의 modelCode
     */
    public void evictRowHash(String modelCode) {
        if (modelCode != null) {
            lastKnownRowHash.remove(modelCode);
        }
    }

    /**
     * 테스트 전용 — 메모리 hash 캐시 초기화.
     * IT 에서 @BeforeEach 로 호출하여 테스트 간 격리 보장. 운영 코드에서 호출 금지.
     */
    public void clearHashCacheForTest() {
        lastKnownRowHash.clear();
    }

    private String sheetSyncKey(String scope) {
        return sheetId + ":" + scope;
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

    private enum SpecValueMode {
        AS_IS,
        NUMBER,
        RANGE,
        DIMENSION
    }

    private record Pair(String a, String b) {
    }

    private record ClassificationNames(String catL, String catM, String catS) {
    }

    private record ClassificationSet(Classification catL, Classification catM, Classification catS) {
    }

    private record ColumnGroup(String type, List<Integer> cols) {
    }

    /**
     * tab 1개 sync 결과.
     *
     * <p><b>카운터 구분 (사이클2 지적 P3-6, 2026-06-11)</b>:
     * <ul>
     *   <li>{@code skipped} — 파싱 불가(이름/modelCode 공백) 행 수</li>
     *   <li>{@code preservedManual} — soft-delete 대상이나 {@code usageScopeManual=true} 로 보존된 품목 수</li>
     * </ul>
     * 두 카운터를 분리하여 sync 리포트에서 "파싱 skip"과 "수동 보존"을 독립적으로 확인 가능.
     */
    public static class TabSyncResult {
        public int inserted = 0;
        public int updated = 0;
        public int unchanged = 0;
        public int softDeleted = 0;
        /** 파싱 불가(이름/modelCode 공백) 행 수. */
        public int skipped = 0;
        /** soft-delete 대상이나 usageScopeManual=true 로 삭제 보호된 품목 수 (사이클2 지적 P3-6). */
        public int preservedManual = 0;
        /**
         * 🚨 2026-07-28 재수렴 R6 결함 5 [MED] fix (I-5) — 탭 매핑이 NONE으로 되돌리려
         * 했으나 활성 수량 동기화 규칙이 참조 중이라 usageScope 갱신을 보류한 품목 수.
         * preservedManual과 원인이 다르므로(수동 override 보호 vs 규칙 무결성 보호)
         * 별도 카운터로 집계한다.
         */
        public int preservedByRule = 0;
        /** MIG-8 변환이 잡고 있는 Product reservation 때문에 soft-delete를 보류한 품목 수. */
        public int deferredByEcountReservation = 0;
        public int specsLinked = 0;
        public String error;
    }

    /**
     * 전체 sync 집계.
     *
     * <p>{@code totalPreservedManual} — usageScopeManual=true 로 soft-delete 에서 보호된 품목 합계.
     * {@code totalSkipped} 와 별도 집계하여 파싱 skip 과 혼용하지 않는다 (사이클2 지적 P3-6).
     */
    public static class SyncSummary {
        public Map<String, TabSyncResult> byTab = new HashMap<>();
        public Map<String, ComponentSyncResult> byComponentTab = new HashMap<>();
        public int totalInserted = 0;
        public int totalUpdated = 0;
        public int totalSoftDeleted = 0;
        public int totalSkipped = 0;
        /** usageScopeManual=true 로 soft-delete 보호된 품목 합계 (사이클2 지적 P3-6). */
        public int totalPreservedManual = 0;
        /** 활성 수량 동기화 규칙 참조로 usageScope NONE 전환이 보류된 품목 합계(R6 결함 5). */
        public int totalPreservedByRule = 0;
        public int totalComponentsLinked = 0;
        public int totalBundlesMarked = 0;
        public int totalSpecsLinked = 0;
        public long durationMs = 0;
        public String error;
    }
}
