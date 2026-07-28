package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.QuantitySyncAggregation;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.QuantitySyncRoundingMode;
import com.samhanair.logis.product.domain.QuantitySyncRule;
import com.samhanair.logis.product.domain.QuantitySyncSource;
import com.samhanair.logis.product.domain.QuantitySyncTarget;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.QuantitySyncRuleRepository;
import com.samhanair.logis.product.repository.QuantitySyncSourceRepository;
import com.samhanair.logis.product.repository.QuantitySyncTargetRepository;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.Draft;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.ProductSnapshot;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.RuleSnapshot;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.SourceDraft;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.TargetDraft;
import com.samhanair.logis.product.web.dto.QuantitySyncProductRef;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 수량 동기화 규칙 CRUD와 전체 graph 저장 검증 서비스.
 *
 * <p>한 요청의 모든 Product 해소·검증·child soft-delete·재삽입을 하나의 transaction으로 묶는다.
 * evaluator를 호출하거나 기존 견적·주문 수량을 변경하지 않는다.
 */
@Service
public class QuantitySyncRuleService {

    private static final String GRAPH_MUTATION_LOCK_KEY = "quantity_sync_rule_graph_mutation";

    /**
     * 재수렴 결함 2 [최우선] — {@link #toResponse} 가 참조 Product를 찾지 못했을 때
     * 표시하는 placeholder. UUID를 노출하지 않으면서(feedback_uuid_no_user_visibility.md)
     * 사용자가 "이 규칙의 이 슬롯이 깨졌다"를 알아보고 스스로 삭제/편집(M-2)할 수 있게 한다.
     */
    private static final String MISSING_PRODUCT_LABEL = "(삭제된 품목)";

    private final QuantitySyncRuleRepository ruleRepository;
    private final QuantitySyncSourceRepository sourceRepository;
    private final QuantitySyncTargetRepository targetRepository;
    private final ProductRepository productRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final ProductEstimateExposureRepository exposureRepository;
    private final QuantitySyncRuleValidator validator;
    private final JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    public QuantitySyncRuleService(QuantitySyncRuleRepository ruleRepository,
                                   QuantitySyncSourceRepository sourceRepository,
                                   QuantitySyncTargetRepository targetRepository,
                                   ProductRepository productRepository,
                                   BundleComponentRepository bundleComponentRepository,
                                   ProductEstimateExposureRepository exposureRepository,
                                   QuantitySyncRuleValidator validator,
                                   JdbcTemplate jdbcTemplate) {
        this.ruleRepository = ruleRepository;
        this.sourceRepository = sourceRepository;
        this.targetRepository = targetRepository;
        this.productRepository = productRepository;
        this.bundleComponentRepository = bundleComponentRepository;
        this.exposureRepository = exposureRepository;
        this.validator = validator;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 활성 규칙 목록을 priority/ruleKey 순서로 조회한다. */
    @Transactional(readOnly = true)
    public List<QuantitySyncRuleResponse> list(QuantitySyncEstimateCategory category) {
        List<QuantitySyncRule> rules = category == null
                ? ruleRepository.findAllByIsDeletedFalseOrderByPriorityAscRuleKeyAsc()
                : ruleRepository.findAllByEstimateCategoryAndIsDeletedFalseOrderByPriorityAscRuleKeyAsc(category);
        return rules.stream().map(this::toResponse).toList();
    }

    /** ruleKey로 활성 규칙을 조회한다. */
    @Transactional(readOnly = true)
    public QuantitySyncRuleResponse get(String ruleKey) {
        return toResponse(findRule(ruleKey));
    }

    /**
     * 활성이며 enabled인 규칙 중 주어진 Product를 source 또는 target으로 참조하는
     * ruleKey 목록을 ruleKey 오름차순으로 반환한다.
     *
     * <p>R1 결함 3 [MED] — 품목 단종/삭제가 이 규칙들 때문에 막힐 때 {@link
     * com.samhanair.logis.product.service.ProductService#discontinue}/{@code delete}가
     * 원인을 사용자에게 드러내기 위해 사용한다(UUID 대신 ruleKey 노출, I-3 준수).
     * R1 결함 2 [MED] — enabled=false 규칙은 강제력이 없으므로(survey.md:509) 제외한다.
     *
     * @param productId 참조 여부를 확인할 Product 내부 FK
     * @return 참조하는 활성+enabled 규칙의 ruleKey 목록(없으면 빈 목록)
     */
    @Transactional(readOnly = true)
    public List<String> findEnabledRuleKeysReferencing(UUID productId) {
        // active=false 로 판정을 넘겨 카테고리와 무관하게(어떤 카테고리를 요청해도
        // satisfiesMembership=false) ANY 참조를 차단한다 — discontinue/delete 처럼
        // 품목 자체가 더 이상 규칙의 대상이 될 수 없는 상태 전이 전용 조회다.
        return findEnabledRuleKeysBrokenByResultingState(productId, false, false, Set.of());
    }

    /**
     * 활성 규칙이 참조하는 품목에서 요청 카테고리를 제거하는 규칙 키를 반환한다.
     *
     * <p>품목 편집은 참조 중이라는 이유만으로 전부 막지 않고, 해당 규칙의 카테고리를
     * 실제로 제거해 무결성을 깨는 경우에만 차단한다. {@code COMMERCIAL_MULTI}는 규칙
     * 스키마의 {@code COMM_MULTI}와 같은 카테고리다.
     *
     * @param productId 품목 내부 식별자
     * @param requestedCategories 저장 후 유지할 견적 노출 카테고리
     * @return 요청 후 규칙 카테고리가 사라지는 활성 규칙 키
     */
    @Transactional(readOnly = true)
    public List<String> findEnabledRuleKeysReferencingMissingCategory(
            UUID productId, Set<EstimateCategory> requestedCategories) {
        return findEnabledRuleKeysBrokenByResultingState(productId, true, true, requestedCategories);
    }

    /**
     * 🚨 2026-07-28 재수렴 R6 결함 1·2 [단일 근본 원인] fix — I-1 통합 판정 엔진.
     *
     * <p>이전에는 "usageScope가 NONE인가"(전이 열거) · "요청 카테고리에 규칙 카테고리가
     * 있는가"(카테고리만) 두 축을 호출부마다 따로 판정해, 열거되지 않은 값(PARTNER_ORDER 등)
     * 이나 두 축을 함께 바꾸는 요청이 새 라운드마다 통과했다(계열 5회차: R1 단종/삭제 →
     * R2 optionIn → R3 usageScope=NONE → R4 estimateCategories → R5 PARTNER_ORDER).
     *
     * <p>판정은 열거가 아니라 <b>"쓰기 이후 이 품목의 (active, visible, categories) 스냅샷이
     * 이 품목을 참조하는 모든 활성(enabled) 규칙의 source/target 요건을 계속 만족하는가"</b>
     * 하나뿐이다 — {@link QuantitySyncRuleValidator#validateProduct}가 신규 규칙 생성 시
     * 요구하는 것과 동일한 3조건(active·visible·categories 멤버십)을 기존 활성 규칙에도
     * 적용한다. 호출자는 자신이 만들 결과 상태를 3개 파라미터로 넘기기만 하면 되고, 이
     * 메서드는 그 값을 실제 DB에 반영하지 않는다(호출자가 사전 확인 후 실제 mutation을
     * 수행하는 관례를 유지).
     *
     * @param productId          대상 품목 내부 FK
     * @param resultingActive    쓰기 이후 이 품목이 {@code ProductStatus.ACTIVE} 로 남는지
     * @param resultingVisible   쓰기 이후 {@code usageScope != NONE} 로 남는지(견적 화면 노출 가능)
     * @param resultingCategories 쓰기 이후 이 품목이 활성 노출(견적 M:N)을 유지하는 카테고리 집합
     * @return 이 결과 상태로 무결성이 깨지는 활성(enabled) 규칙의 ruleKey 목록(오름차순, 없으면 빈 목록)
     */
    @Transactional(readOnly = true)
    public List<String> findEnabledRuleKeysBrokenByResultingState(
            UUID productId, boolean resultingActive, boolean resultingVisible,
            Set<EstimateCategory> resultingCategories) {
        Set<UUID> ruleIds = new HashSet<>();
        sourceRepository.findAllBySourceProductIdAndIsDeletedFalse(productId)
                .forEach(source -> ruleIds.add(source.getRuleId()));
        targetRepository.findAllByTargetProductIdAndIsDeletedFalse(productId)
                .forEach(target -> ruleIds.add(target.getRuleId()));
        if (ruleIds.isEmpty()) {
            return List.of();
        }
        boolean satisfiesMembership = resultingActive && resultingVisible;
        return ruleRepository.findAllById(ruleIds).stream()
                .filter(QuantitySyncRule::isEnabled)
                .filter(rule -> !satisfiesMembership
                        || !containsRuleCategory(resultingCategories, rule.getEstimateCategory()))
                .map(QuantitySyncRule::getRuleKey)
                .sorted()
                .toList();
    }

    /**
     * 🚨 2026-07-28 재수렴 R6 결함 3 [MED] fix — I-3: BUNDLE 구성품을 바꾸는 모든 쓰기
     * 경로({@link BundleComponentService}·{@link ProductSheetSyncService#syncComponentTab})가
     * 신규 규칙 생성 시 검증({@link QuantitySyncRuleValidator} "BUNDLE source는 같은 BUNDLE의
     * component target을 가질 수 없습니다")과 같은 가드를 지나도록 한다. 이 BUNDLE 이 source인
     * 활성(enabled) 규칙 중, 결과 구성품 집합과 target 이 겹치는 규칙 키를 반환한다.
     *
     * @param bundleProductId 대상 BUNDLE 품목 내부 FK
     * @param resultingComponentProductIds 쓰기 이후 이 BUNDLE 이 가질 구성품 productId 집합
     * @return 자기 구성품을 target 으로 갖게 되는 활성 규칙의 ruleKey 목록(오름차순, 없으면 빈 목록)
     */
    @Transactional(readOnly = true)
    public List<String> findEnabledRuleKeysBrokenByBundleComponents(
            UUID bundleProductId, Set<UUID> resultingComponentProductIds) {
        if (resultingComponentProductIds == null || resultingComponentProductIds.isEmpty()) {
            return List.of();
        }
        List<QuantitySyncSource> sources =
                sourceRepository.findAllBySourceProductIdAndIsDeletedFalse(bundleProductId);
        if (sources.isEmpty()) {
            return List.of();
        }
        Set<UUID> ruleIds = sources.stream().map(QuantitySyncSource::getRuleId).collect(Collectors.toSet());
        List<QuantitySyncRule> rules = ruleRepository.findAllById(ruleIds).stream()
                .filter(QuantitySyncRule::isEnabled)
                .toList();
        if (rules.isEmpty()) {
            return List.of();
        }
        Set<String> broken = new java.util.TreeSet<>();
        for (QuantitySyncRule rule : rules) {
            boolean overlap = targetRepository
                    .findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId()).stream()
                    .anyMatch(target -> resultingComponentProductIds.contains(target.getTargetProductId()));
            if (overlap) {
                broken.add(rule.getRuleKey());
            }
        }
        return List.copyOf(broken);
    }

    private boolean containsRuleCategory(Set<EstimateCategory> requestedCategories,
                                         QuantitySyncEstimateCategory ruleCategory) {
        if (requestedCategories == null) {
            return false;
        }
        return requestedCategories.stream().anyMatch(category -> switch (category) {
            case HOME_MULTI -> ruleCategory == QuantitySyncEstimateCategory.HOME_MULTI;
            case SINGLE_SET -> ruleCategory == QuantitySyncEstimateCategory.SINGLE_SET;
            case COMMERCIAL_MULTI -> ruleCategory == QuantitySyncEstimateCategory.COMM_MULTI;
            case LEGACY, OTHER -> false;
        });
    }

    /** 신규 규칙을 전체 graph 검증 후 생성한다. */
    @Transactional
    public QuantitySyncRuleResponse create(QuantitySyncRuleRequest request, String actor) {
        lockGraphMutation();
        // 재수렴 결함 2 [MED] A — 이미 활성 상태인 ruleKey로 POST하면 부분 unique index
        // ux_qsr_rule_key_active(V24:80-82)에서만 걸려 DataIntegrityViolationException →
        // "동시 편집 충돌 또는 제약 위반"(409, GlobalExceptionHandler:131-136)으로 원인이
        // 뭉개졌다. 평범한 입력 실수(이미 쓰는 키로 다시 생성 시도)이지 동시 편집 충돌이
        // 아니므로 여기서 먼저 걸러 어떤 ruleKey가 이미 존재하는지 알려준다. 순수 동시성
        // 경합(두 요청이 동시에 같은 신규 ruleKey로 도착)은 여전히 DB unique index가
        // backstop으로 막고 그 경우엔 기존 409 그대로 유지된다(S-4).
        if (ruleRepository.findByRuleKeyAndIsDeletedFalse(request.ruleKey()).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 존재하는 규칙 키입니다: " + request.ruleKey());
        }
        Map<String, Product> products = resolveProducts(request);
        validator.validate(toDraft(request, products, activeRuleSnapshots()));
        QuantitySyncRule rule = QuantitySyncRule.create(request.ruleKey(), request.estimateCategory(),
                request.name(), request.enabled(), parseAggregation(request.aggregation()), request.conditionJson(),
                request.inactiveBehavior(), request.conflictPolicy(), request.priority(), request.legacyRef());
        ruleRepository.saveAndFlush(rule);
        saveChildren(rule.getId(), request, products, actor);
        return toResponse(rule);
    }

    /** 기존 ruleKey의 정의와 source/target 전체를 원자적으로 교체한다. */
    @Transactional
    public QuantitySyncRuleResponse replace(String ruleKey, QuantitySyncRuleRequest request, String actor) {
        if (!ruleKey.equals(request.ruleKey())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "path ruleKey와 body ruleKey가 다릅니다.");
        }
        lockGraphMutation();
        QuantitySyncRule rule = ruleRepository.findByRuleKeyForUpdate(ruleKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "규칙을 찾을 수 없습니다: " + ruleKey));
        Map<String, Product> products = resolveProducts(request);
        validator.validate(toDraft(request, products, activeRuleSnapshots()));
        rule.changeDefinition(request.estimateCategory(), request.name(), request.enabled(),
                parseAggregation(request.aggregation()), request.conditionJson(), request.inactiveBehavior(),
                request.conflictPolicy(), request.priority(), request.legacyRef());
        String resolvedActor = actor == null || actor.isBlank() ? "system" : actor;
        sourceRepository.findAllByRuleIdAndIsDeletedFalseOrderById(rule.getId())
                .forEach(source -> source.markDeleted(resolvedActor));
        targetRepository.findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId())
                .forEach(target -> target.markDeleted(resolvedActor));
        // 기존 active child UPDATE를 신규 child INSERT보다 먼저 반영해 부분 unique index 충돌을 막는다.
        entityManager.flush();
        saveChildren(rule.getId(), request, products, resolvedActor);
        return toResponse(rule);
    }

    /** 규칙과 source/target을 hard delete하지 않고 함께 soft-delete한다. */
    @Transactional
    public void delete(String ruleKey, String actor) {
        lockGraphMutation();
        QuantitySyncRule rule = ruleRepository.findByRuleKeyForUpdate(ruleKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "규칙을 찾을 수 없습니다: " + ruleKey));
        String resolvedActor = actor == null || actor.isBlank() ? "system" : actor;
        sourceRepository.findAllByRuleIdAndIsDeletedFalseOrderById(rule.getId())
                .forEach(source -> source.markDeleted(resolvedActor));
        targetRepository.findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId())
                .forEach(target -> target.markDeleted(resolvedActor));
        rule.markDeleted(resolvedActor);
    }

    /** 규칙 그래프의 검증부터 child 저장/commit까지 모든 인스턴스를 직렬화한다. */
    public void lockGraphMutation() {
        entityManager.createNativeQuery(
                        "SELECT pg_advisory_xact_lock(CAST(hashtext(:lockKey) AS bigint))")
                .setParameter("lockKey", GRAPH_MUTATION_LOCK_KEY)
                .getSingleResult();
    }

    /**
     * 외부 시트 응답을 기다리기 전에 이 탭의 최신 sync 세대를 예약한다.
     *
     * <p>짧은 별도 트랜잭션으로 세대만 증가시키므로 Google Sheets HTTP 대기 동안
     * graph advisory lock을 점유하지 않는다. 동시 요청은 먼저 시작한 요청이 낮은
     * 세대를 갖도록 이 지점에서 순서를 확정한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long reserveSheetSyncGeneration(String syncKey) {
        // The generation row's unique-key UPSERT serializes reservations for the
        // same sheet scope. Do not take the graph lock here: this short transaction
        // may be called from a class-level transactional test or caller that already
        // owns the graph lock, and it must commit before the external Sheets read.
        return jdbcTemplate.queryForObject("""
                INSERT INTO product_sheet_sync_generation (sync_key, generation)
                VALUES (?, 1)
                ON CONFLICT (sync_key) DO UPDATE
                    SET generation = product_sheet_sync_generation.generation + 1
                RETURNING generation
                """, Long.class, syncKey);
    }

    /** 현재 DB에 예약된 세대와 일치하는지 확인한다. 호출자는 graph lock을 보유해야 한다. */
    public boolean isCurrentSheetSyncGeneration(String syncKey, long generation) {
        Long current = jdbcTemplate.queryForObject(
                "SELECT generation FROM product_sheet_sync_generation WHERE sync_key = ?",
                Long.class, syncKey);
        return current != null && current == generation;
    }

    private void saveChildren(UUID ruleId, QuantitySyncRuleRequest request,
                              Map<String, Product> products, String actor) {
        String resolvedActor = actor == null || actor.isBlank() ? "system" : actor;
        List<QuantitySyncSource> sources = request.sources().stream()
                .map(source -> QuantitySyncSource.create(ruleId,
                        products.get(source.productCode()).getId(), source.factor()))
                .toList();
        List<QuantitySyncTarget> targets = request.targets().stream()
                .map(target -> QuantitySyncTarget.create(ruleId,
                        products.get(target.productCode()).getId(), target.multiplier(),
                        QuantitySyncRoundingMode.valueOf(target.roundingMode()), target.displayOrder()))
                .toList();
        sourceRepository.saveAll(sources);
        targetRepository.saveAll(targets);
        // actor는 BaseEntity audit listener가 채우며, null context에서도 soft-delete actor는 명시한다.
        if (resolvedActor.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "저장 주체가 없습니다.");
        }
    }

    private Map<String, Product> resolveProducts(QuantitySyncRuleRequest request) {
        Set<String> codes = new HashSet<>();
        request.sources().forEach(source -> codes.add(source.productCode()));
        request.targets().forEach(target -> codes.add(target.productCode()));
        Map<String, Product> result = new HashMap<>();
        for (String code : codes) {
            Product product = productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(code)
                    .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND,
                            "품목을 찾을 수 없습니다: " + code));
            result.put(code, product);
        }
        return result;
    }

    private Draft toDraft(QuantitySyncRuleRequest request, Map<String, Product> products,
                          List<RuleSnapshot> existingRules) {
        Set<UUID> productIds = products.values().stream().map(Product::getId).collect(Collectors.toSet());
        Map<UUID, Set<String>> categoriesByProductId = resolveProductCategories(productIds);
        Map<String, ProductSnapshot> snapshots = products.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> toSnapshot(entry.getValue(),
                        categoriesByProductId.getOrDefault(entry.getValue().getId(), Set.of()))));
        return new Draft(request.ruleKey(), request.estimateCategory().name(), request.name(), request.enabled(),
                request.aggregation(), request.conditionJson(), request.inactiveBehavior().name(),
                request.conflictPolicy().name(), request.priority(), request.legacyRef(),
                request.sources().stream().map(s -> new SourceDraft(s.productCode(), s.factor())).toList(),
                request.targets().stream().map(t -> new TargetDraft(t.productCode(), t.multiplier(),
                        t.roundingMode(), t.displayOrder())).toList(), snapshots, existingRules);
    }

    /**
     * 재수렴 결함 1 [최우선] fix — product_estimate_exposure(V18 M:N 단일 원천)에서 Product별
     * 활성 노출 카테고리 집합을 일괄 조회하고, 규칙 category 어휘(HOME_MULTI/SINGLE_SET/
     * COMM_MULTI)로 매핑한다. products.estimate_category(V18 이후 죽은 컬럼)는 읽지 않는다 —
     * 실 API로 만든 품목은 그 컬럼이 항상 NULL이라 계속 읽으면 어떤 품목도 카테고리를
     * 찾지 못해 모든 규칙 연결이 거부된다(S-1). N+1을 피하려 요청에 등장한 Product ID
     * 전체를 한 번에 조회한다.
     */
    private Map<UUID, Set<String>> resolveProductCategories(Set<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Set<String>> result = new HashMap<>();
        for (ProductEstimateExposure exposure : exposureRepository.findByProductIdInAndIsDeletedFalse(productIds)) {
            String ruleCategory = toRuleCategory(exposure.getEstimateCategory());
            if (ruleCategory == null) {
                continue;
            }
            result.computeIfAbsent(exposure.getProductId(), ignored -> new HashSet<>()).add(ruleCategory);
        }
        return result;
    }

    /**
     * 노출 카테고리(5종: HOME_MULTI/SINGLE_SET/COMMERCIAL_MULTI/LEGACY/OTHER)를 규칙 category
     * 어휘(3종: HOME_MULTI/SINGLE_SET/COMM_MULTI)로 매핑한다. LEGACY/OTHER는 어떤 규칙
     * category에도 대응하지 않으므로 null — 그 노출만 가진 Product는 규칙에 연결할 수 없다
     * (V24 CHECK chk_qsr_category와 QuantitySyncRuleValidator.CATEGORIES가 이미 3종만
     * 허용하므로 대칭이다).
     */
    private static String toRuleCategory(EstimateCategory category) {
        return switch (category) {
            case HOME_MULTI -> "HOME_MULTI";
            case SINGLE_SET -> "SINGLE_SET";
            case COMMERCIAL_MULTI -> "COMM_MULTI";
            case LEGACY, OTHER -> null;
        };
    }

    private ProductSnapshot toSnapshot(Product product, Set<String> categories) {
        Set<String> componentCodes = product.getProductType() == ProductType.BUNDLE
                ? bundleComponentRepository.findByBundleProductId(product.getId()).stream()
                        .map(BundleComponent::getComponentProductCode).collect(Collectors.toSet())
                : Set.of();
        return new ProductSnapshot(product.getId(), productCode(product), product.getName(), categories,
                product.getStatus() == ProductStatus.ACTIVE,
                product.getUsageScope() != UsageScope.NONE,
                product.getProductType() == ProductType.BUNDLE,
                componentCodes, componentProductIds(componentCodes));
    }

    /**
     * 재수렴 결함 3 [MED] fix — BUNDLE 구성품의 {@code componentProductCode}(canonical
     * modelCode, bundle_component 테이블 자신의 natural key)를 productId로 재해소한다.
     * {@link com.samhanair.logis.product.service.BundleExpander#expand}와 동일하게
     * modelCode 정확 매칭만 쓴다(modelName fallback 없음 — componentProductCode는 사용자
     * 입력이 아니라 항상 canonical modelCode이므로 별칭 문제가 없다). 별칭은 draft
     * 쪽(target productCode)에서만 생기므로, 검증부(QuantitySyncRuleValidator)가
     * {@code targetProduct.productId()}와 이 집합을 비교한다. 미해소(dangling) 구성품은
     * 조용히 제외한다 — BundleComponentRepository#findUnresolvedComponents가 이미
     * 별도로 추적하는 정합 문제이지 이 검증의 책임이 아니다.
     */
    private Set<UUID> componentProductIds(Set<String> componentCodes) {
        if (componentCodes.isEmpty()) {
            return Set.of();
        }
        return productRepository.findByModelCodeInAndIsDeletedFalse(componentCodes).stream()
                .map(Product::getId).collect(Collectors.toSet());
    }

    private List<RuleSnapshot> activeRuleSnapshots() {
        List<QuantitySyncRule> rules = ruleRepository.findAllByIsDeletedFalseOrderByPriorityAscRuleKeyAsc();
        Set<UUID> productIds = new HashSet<>();
        Map<UUID, List<QuantitySyncSource>> sourcesByRule = new HashMap<>();
        Map<UUID, List<QuantitySyncTarget>> targetsByRule = new HashMap<>();
        for (QuantitySyncRule rule : rules) {
            List<QuantitySyncSource> sources = sourceRepository.findAllByRuleIdAndIsDeletedFalseOrderById(rule.getId());
            List<QuantitySyncTarget> targets = targetRepository.findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId());
            sourcesByRule.put(rule.getId(), sources);
            targetsByRule.put(rule.getId(), targets);
            sources.forEach(source -> productIds.add(source.getSourceProductId()));
            targets.forEach(target -> productIds.add(target.getTargetProductId()));
        }
        Map<UUID, Product> products = productRepository.findAllByIdIn(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        return rules.stream().map(rule -> new RuleSnapshot(
                rule.getRuleKey(), rule.getEstimateCategory().name(), rule.isEnabled(), rule.getConditionJson(),
                rule.getConflictPolicy().name(), rule.getPriority(),
                sourcesByRule.getOrDefault(rule.getId(), List.of()).stream()
                        .map(source -> danglingSafeProductCode(
                                products.get(source.getSourceProductId()), source.getSourceProductId()))
                        .collect(Collectors.toSet()),
                targetsByRule.getOrDefault(rule.getId(), List.of()).stream()
                        .map(target -> danglingSafeProductCode(
                                products.get(target.getTargetProductId()), target.getTargetProductId()))
                        .collect(Collectors.toSet()),
                // 🚨 2026-07-28 재수렴 결함 1·2 [단일 근본 원인] fix — sourceProductIds/
                // targetProductIds를 danglingSafeProductCode와 같은 소스(source/target
                // 엔티티에 이미 있는 FK)에서 채운다. 추가 쿼리 없음 — products 맵 조회
                // 성공 여부와 무관하게 productId 자체는 항상 존재한다(dangling 참조에도
                // FK는 남아 있다).
                sourcesByRule.getOrDefault(rule.getId(), List.of()).stream()
                        .map(QuantitySyncSource::getSourceProductId).collect(Collectors.toSet()),
                targetsByRule.getOrDefault(rule.getId(), List.of()).stream()
                        .map(QuantitySyncTarget::getTargetProductId).collect(Collectors.toSet()))).toList();
    }

    private QuantitySyncRuleResponse toResponse(QuantitySyncRule rule) {
        List<QuantitySyncSource> sources = sourceRepository
                .findAllByRuleIdAndIsDeletedFalseOrderById(rule.getId());
        List<QuantitySyncTarget> targets = targetRepository
                .findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId());
        Set<UUID> productIds = new HashSet<>();
        sources.forEach(source -> productIds.add(source.getSourceProductId()));
        targets.forEach(target -> productIds.add(target.getTargetProductId()));
        Map<UUID, Product> products = productRepository.findAllByIdIn(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        List<QuantitySyncProductRef> sourceRefs = sources.stream()
                .map(source -> {
                    Product product = products.get(source.getSourceProductId());
                    return QuantitySyncProductRef.source(
                            product == null ? null : productCode(product),
                            product == null ? MISSING_PRODUCT_LABEL : product.getName(),
                            source.getFactor());
                }).toList();
        List<QuantitySyncProductRef> targetRefs = targets.stream()
                .map(target -> {
                    Product product = products.get(target.getTargetProductId());
                    return QuantitySyncProductRef.target(
                            product == null ? null : productCode(product),
                            product == null ? MISSING_PRODUCT_LABEL : product.getName(),
                            target.getMultiplier(), target.getRoundingMode().name(), target.getDisplayOrder());
                }).toList();
        return new QuantitySyncRuleResponse(rule.getRuleKey(), rule.getEstimateCategory(), rule.getName(),
                rule.isEnabled(), rule.getAggregation(), rule.getConditionJson(), rule.getInactiveBehavior(),
                rule.getConflictPolicy(), rule.getPriority(), rule.getLegacyRef(), sourceRefs, targetRefs);
    }

    private QuantitySyncRule findRule(String ruleKey) {
        return ruleRepository.findByRuleKeyAndIsDeletedFalse(ruleKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "규칙을 찾을 수 없습니다: " + ruleKey));
    }

    private static String productCode(Product product) {
        if (product == null) {
            throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND, "규칙에 연결된 품목을 찾을 수 없습니다.");
        }
        return product.getModelCode() == null || product.getModelCode().isBlank()
                ? product.getModelName() : product.getModelCode();
    }

    /**
     * 재수렴 결함 2 [최우선] fix — {@link #activeRuleSnapshots()} 는 create/replace가
     * "다른 모든 기존 규칙"의 REPLACE 중복·순환 교차검증에 쓰는 snapshot이다. enabled=false
     * 규칙이 참조하는 Product는 R1 fix로 삭제가 허용되므로, 여기서 {@link #productCode}
     * 처럼 null에 PRODUCT_NOT_FOUND를 던지면 그 규칙 하나 때문에 create/replace 전체가
     * 항상 실패한다(M-1). {@code QuantitySyncRuleValidator}의 REPLACE 중복 검사(:216-224)와
     * 순환 검사(:247)는 이미 {@code existing.enabled()==false} 인 기존 규칙의
     * sourceCodes/targetCodes를 전부 무시하므로, 그 값이 무엇이든 disabled 규칙에는
     * 결과가 달라지지 않는다 — productId 기반 고유 placeholder면 충분하다. enabled 규칙은
     * ProductService의 사전 가드로 이 상태에 도달하지 않는 것이 정상이지만, 방어적으로
     * 여기도 동일하게 관용적으로 처리한다(어떤 이유로든 하나가 깨져도 전체가 죽지 않도록).
     * 이 값은 RuleSnapshot 내부에서만 쓰이고 API 응답으로 나가지 않으므로 UUID 비노출
     * 원칙과 무관하다.
     */
    private static String danglingSafeProductCode(Product product, UUID productId) {
        return product == null ? "~dangling:" + productId : productCode(product);
    }

    private static QuantitySyncAggregation parseAggregation(String value) {
        try {
            return QuantitySyncAggregation.valueOf(value);
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "aggregation은 SUM만 허용됩니다.");
        }
    }
}
