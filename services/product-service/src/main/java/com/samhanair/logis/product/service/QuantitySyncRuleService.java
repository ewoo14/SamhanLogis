package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.Product;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 수량 동기화 규칙 CRUD와 전체 graph 저장 검증 서비스.
 *
 * <p>한 요청의 모든 Product 해소·검증·child soft-delete·재삽입을 하나의 transaction으로 묶는다.
 * evaluator를 호출하거나 기존 견적·주문 수량을 변경하지 않는다.
 */
@Service
public class QuantitySyncRuleService {

    private final QuantitySyncRuleRepository ruleRepository;
    private final QuantitySyncSourceRepository sourceRepository;
    private final QuantitySyncTargetRepository targetRepository;
    private final ProductRepository productRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final QuantitySyncRuleValidator validator;

    @PersistenceContext
    private EntityManager entityManager;

    public QuantitySyncRuleService(QuantitySyncRuleRepository ruleRepository,
                                   QuantitySyncSourceRepository sourceRepository,
                                   QuantitySyncTargetRepository targetRepository,
                                   ProductRepository productRepository,
                                   BundleComponentRepository bundleComponentRepository,
                                   QuantitySyncRuleValidator validator) {
        this.ruleRepository = ruleRepository;
        this.sourceRepository = sourceRepository;
        this.targetRepository = targetRepository;
        this.productRepository = productRepository;
        this.bundleComponentRepository = bundleComponentRepository;
        this.validator = validator;
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
        Set<UUID> ruleIds = new HashSet<>();
        sourceRepository.findAllBySourceProductIdAndIsDeletedFalse(productId)
                .forEach(source -> ruleIds.add(source.getRuleId()));
        targetRepository.findAllByTargetProductIdAndIsDeletedFalse(productId)
                .forEach(target -> ruleIds.add(target.getRuleId()));
        if (ruleIds.isEmpty()) {
            return List.of();
        }
        return ruleRepository.findAllById(ruleIds).stream()
                .filter(QuantitySyncRule::isEnabled)
                .map(QuantitySyncRule::getRuleKey)
                .sorted()
                .toList();
    }

    /** 신규 규칙을 전체 graph 검증 후 생성한다. */
    @Transactional
    public QuantitySyncRuleResponse create(QuantitySyncRuleRequest request, String actor) {
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
        QuantitySyncRule rule = ruleRepository.findByRuleKeyForUpdate(ruleKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "규칙을 찾을 수 없습니다: " + ruleKey));
        String resolvedActor = actor == null || actor.isBlank() ? "system" : actor;
        sourceRepository.findAllByRuleIdAndIsDeletedFalseOrderById(rule.getId())
                .forEach(source -> source.markDeleted(resolvedActor));
        targetRepository.findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(rule.getId())
                .forEach(target -> target.markDeleted(resolvedActor));
        rule.markDeleted(resolvedActor);
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
        Map<String, ProductSnapshot> snapshots = products.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> toSnapshot(entry.getValue())));
        return new Draft(request.ruleKey(), request.estimateCategory().name(), request.name(), request.enabled(),
                request.aggregation(), request.conditionJson(), request.inactiveBehavior().name(),
                request.conflictPolicy().name(), request.priority(), request.legacyRef(),
                request.sources().stream().map(s -> new SourceDraft(s.productCode(), s.factor())).toList(),
                request.targets().stream().map(t -> new TargetDraft(t.productCode(), t.multiplier(),
                        t.roundingMode(), t.displayOrder())).toList(), snapshots, existingRules);
    }

    private ProductSnapshot toSnapshot(Product product) {
        Set<String> componentCodes = product.getProductType() == ProductType.BUNDLE
                ? bundleComponentRepository.findByBundleProductId(product.getId()).stream()
                        .map(BundleComponent::getComponentProductCode).collect(Collectors.toSet())
                : Set.of();
        String category = product.getEstimateCategory() == null ? null : product.getEstimateCategory().name();
        return new ProductSnapshot(productCode(product), product.getName(), category,
                product.getStatus() == ProductStatus.ACTIVE,
                product.getUsageScope() != UsageScope.NONE,
                product.getProductType() == ProductType.BUNDLE,
                componentCodes);
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
                        .map(source -> productCode(products.get(source.getSourceProductId())))
                        .collect(Collectors.toSet()),
                targetsByRule.getOrDefault(rule.getId(), List.of()).stream()
                        .map(target -> productCode(products.get(target.getTargetProductId())))
                        .collect(Collectors.toSet()))).toList();
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
                    return QuantitySyncProductRef.source(productCode(product), product.getName(), source.getFactor());
                }).toList();
        List<QuantitySyncProductRef> targetRefs = targets.stream()
                .map(target -> {
                    Product product = products.get(target.getTargetProductId());
                    return QuantitySyncProductRef.target(productCode(product), product.getName(), target.getMultiplier(),
                            target.getRoundingMode().name(), target.getDisplayOrder());
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

    private static QuantitySyncAggregation parseAggregation(String value) {
        try {
            return QuantitySyncAggregation.valueOf(value);
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "aggregation은 SUM만 허용됩니다.");
        }
    }
}
