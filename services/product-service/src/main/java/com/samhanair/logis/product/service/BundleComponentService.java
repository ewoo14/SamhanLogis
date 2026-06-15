package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.realtime.ProductCatalogChangePublisher;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 구성품 CRUD + 표시 순서 일괄 갱신 서비스 (§1c/§1d 2026-06-11 개발책임자 확정).
 *
 * <p>모든 변경은 도메인 메서드 경유 — reflection / setter 직접 호출 금지.
 * BundleExpander 는 캐시를 두지 않으므로(조회 시 매번 DB 조회) PUT 후 evict 불필요.
 *
 * <p><b>실시간 publish (§2-2 2026-06-11)</b>:
 * components PUT / display-orders PUT 성공 시 {@link ProductRealtimeBroker} 를 통해
 * {@code product:catalog:changed} 이벤트를 broadcast — FE SSE 구독자 화면 invalidate 트리거.
 * 페이로드는 {@code {event, modelCode}} 최소 구조 (과설계 금지, 목록 invalidate 용도).
 *
 * <p><b>예외 컨벤션 (D-PCE-01 fix)</b>:
 * 모든 비즈니스 오류는 {@link BusinessException} 을 사용한다 ({@code ResponseStatusException}
 * 사용 금지). {@link GlobalExceptionHandler} 는 {@link BusinessException} 의 {@link ErrorCode}
 * httpStatus 를 그대로 반환하므로 409/400 매핑이 보장된다.
 *
 * <p><b>display-orders 카테고리 검증 축 (D-PCE-02 + G fix)</b>:
 * 검증 기준 축은 {@link EstimateCategory} — FE 카탈로그 카테고리 선택과 동일하다.
 * {@code findExposedCatalog} 는 실제로 {@link com.samhanair.logis.product.domain.ProductCategory}
 * (별개 enum) 로 WHERE/ORDER BY 하므로 '동일 차원' 이 아니다(G fix — 허위 문구 제거).
 * 시트 기본 적재 데이터는 productCategory↔estimateCategory 가 1:1 이나, 수동 override
 * (markUsageManual) 시 desync 가능하다.
 * null {@code estimateCategory} 군은 자체 군으로 허용(null끼리 OK),
 * null + non-null 혼합은 400, 서로 다른 non-null 혼합도 400.
 * display_order 충돌은 {@code findExposedCatalog} 의 {@code modelCode ASC} 타이브레이커로 결정적 해소된다.
 */
@Service
public class BundleComponentService {

    /** 품목 설정 변경 시 FE 카탈로그 목록 invalidate 용 SSE 이벤트 이름. */
    public static final String EVENT_CATALOG_CHANGED = "product:catalog:changed";

    /**
     * 카탈로그 목록 전체 invalidate 채널 ID (well-known UUID).
     *
     * <p>display-orders, components 같은 카탈로그 전체에 영향을 주는 변경은
     * 단일 UUID 채널로 broadcast — FE 는 이 UUID 하나만 구독하면 된다.
     */
    public static final java.util.UUID CATALOG_CHANNEL_ID =
            java.util.UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final ProductRepository productRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final ProductCatalogChangePublisher catalogChangePublisher;
    private final EntityManager entityManager;

    public BundleComponentService(ProductRepository productRepository,
                                  BundleComponentRepository bundleComponentRepository,
                                  ProductCatalogChangePublisher catalogChangePublisher,
                                  EntityManager entityManager) {
        this.productRepository = productRepository;
        this.bundleComponentRepository = bundleComponentRepository;
        this.catalogChangePublisher = catalogChangePublisher;
        this.entityManager = entityManager;
    }

    // ============================================================
    // §1c 구성품 조회
    // ============================================================

    /**
     * BUNDLE 구성품 목록 조회.
     *
     * <p>대상 품목이 BUNDLE 이 아닌 경우에도 빈 목록을 반환한다.
     * 구성품 componentProductCode 로 품목 명칭을 IN 벌크 조회한다 (N+1 방지).
     *
     * <p><b>model_code null 레거시 행 처리 (D-PCE-03 fix)</b>:
     * 구성품 코드가 {@code model_code} 컬럼이 null 인 레거시 행을 가리키는 경우
     * {@code model_code} 기반 IN 조회에서 매칭되지 않는다.
     * 1차 조회(modelCode IN) 이후 미매칭 코드를 {@code model_name} 으로 2차 조회하여
     * componentName 을 해소한다. 그래도 매칭 안 되면 componentProductCode 를 대신 반환한다.
     *
     * @param modelCode 카탈로그 노출 식별자
     * @return 구성품 응답 목록 (표시 순서 = 리스트 인덱스, 1-based 반환)
     */
    @Transactional(readOnly = true)
    public List<BundleComponentResponse> listComponents(String modelCode) {
        Product product = findProductByModelCodeOrThrow(modelCode);
        List<BundleComponent> components = bundleComponentRepository
                .findByBundleProductId(product.getId());

        // 구성품 코드 집합으로 명칭 벌크 조회 — 1차: modelCode IN
        List<String> componentCodes = components.stream()
                .map(BundleComponent::getComponentProductCode)
                .toList();

        Map<String, String> nameByCode = new HashMap<>();
        productRepository.findByModelCodeInAndIsDeletedFalse(componentCodes)
                .forEach(p -> nameByCode.put(p.getModelCode(), p.getName()));

        // D-PCE-03: model_code null 레거시 행 — 1차 미매칭 코드를 model_name 으로 2차 조회
        List<String> unresolved = componentCodes.stream()
                .filter(code -> !nameByCode.containsKey(code))
                .distinct()
                .toList();
        if (!unresolved.isEmpty()) {
            for (String code : unresolved) {
                productRepository.findByModelNameAndIsDeletedFalse(code)
                        .ifPresent(p -> nameByCode.put(code, p.getName()));
            }
        }

        List<BundleComponentResponse> result = new ArrayList<>(components.size());
        for (int i = 0; i < components.size(); i++) {
            BundleComponent bc = components.get(i);
            // 여전히 미매칭이면 코드 자체를 폴백 명칭으로 사용
            String name = nameByCode.getOrDefault(bc.getComponentProductCode(),
                    bc.getComponentProductCode());
            result.add(BundleComponentResponse.from(bc, name, i + 1));
        }
        return result;
    }

    // ============================================================
    // §1c 구성품 replace-all
    // ============================================================

    /**
     * BUNDLE 구성품 replace-all (§1c 2026-06-11).
     *
     * <p><b>동일 BUNDLE 동시 편집 직렬화 (#2, PESSIMISTIC_WRITE)</b>:
     * 부모 해소 직후 {@link ProductRepository#findByIdForUpdate}(PESSIMISTIC_WRITE) 로 부모
     * BUNDLE 행을 재조회하여 동일 세트에 대한 동시 PUT 을 직렬화한다. 두 PUT 이 같은 부모의
     * 구성품 집합을 동시에 replace-all 하면 부분 유니크 인덱스
     * (bundle_product_id, component_product_code, is_deleted=false) 경합으로 유니크 500 또는
     * 집합 병합 오염이 발생하므로, 한 트랜잭션이 먼저 부모 행을 잠가 순서화한다.
     * {@link GlobalExceptionHandler} 의 {@code DataIntegrityViolation→409} 매핑(#1)이 보조 방어.
     *
     * <p>검증 순서:
     * <ol>
     *   <li>대상 품목이 BUNDLE 아님 → 409 CONFLICT</li>
     *   <li>부모 model_code 가 null(전개 불능 죽은 세트) → 409 CONFLICT (#7)</li>
     *   <li>빈 배열 → 400 BAD_REQUEST (전개 불능 세트 방지)</li>
     *   <li>자기 자신 modelCode 포함 → 400 BAD_REQUEST</li>
     *   <li>구성 모델코드가 활성 품목으로 해소 안 됨 → 400 BAD_REQUEST</li>
     *   <li>구성품이 BUNDLE 타입(세트-안-세트) → 400 BAD_REQUEST (#3)</li>
     *   <li>중복 componentProductCode → 400 BAD_REQUEST (부분 유니크 인덱스 위반 사전 차단, P3-2)</li>
     * </ol>
     * 전건 검증 후 기존 구성품 전체 soft-delete → 신규 구성품 INSERT.
     * 트랜잭션 단일(부분 적용 금지).
     *
     * <p><b>구성품 해소 검증 축 (A fix, 2026-06-11)</b>:
     * 구성 모델코드 해소 검증은 {@link ProductRepository#findByModelCodeAndIsDeletedFalse}
     * ({@code model_code} 정확 매칭, model_name fallback 없음) 으로 수행한다 —
     * 실 소비처인 전개(expander) 해소 기준({@link BundleExpander#expand} /
     * {@link BundleComponentRepository#findUnresolvedComponents}) 과 동일하게
     * {@code modelCode-only} 로 검증하여 <b>전개 불가 구성품을 사전 차단</b>한다.
     * {@code model_code=NULL / model_name only} 레거시 행을 구성품으로 저장하면
     * PUT 은 200 으로 통과하나 전표/견적 전개 시 단가 0·productId null 로 silent 방출되어
     * 금액 오류가 발생하는 결함을 막는다(write-path 와 expander 의 해소 축 정렬).
     * 단 {@code listComponents}(read) 의 model_name fallback(D-PCE-03) 은 표시용이므로 유지한다.
     *
     * <p>BundleExpander 는 캐시를 두지 않으므로 evict 불필요.
     *
     * <p><b>soft-delete actor (P3-3)</b>: 기존 구성품 soft-delete 시 호출자
     * {@code X-User-Id} 를 {@code deletedBy} 로 기록한다. {@code actor} 가 null/blank 이면
     * {@code "system"} 으로 대체한다.
     *
     * @param modelCode 대상 BUNDLE 모델코드
     * @param requests  replace-all 구성품 목록 (배열 인덱스 = 표시 순서)
     * @param actor     soft-delete 수행 주체 (X-User-Id, null/blank → "system")
     * @return 갱신된 구성품 응답 목록
     * @throws BusinessException(CONFLICT)      대상 품목이 BUNDLE 이 아닌 경우
     * @throws BusinessException(INVALID_INPUT) 빈 배열 / 자기 자신 포함 / 미해소 코드 / 중복 코드
     */
    @Transactional
    public List<BundleComponentResponse> replaceComponents(String modelCode,
                                                           List<BundleComponentRequest> requests,
                                                           String actor) {
        Product resolved = findProductByModelCodeOrThrow(modelCode);

        // #2 동시성 가드: 부모 해소 직후 id 로 PESSIMISTIC_WRITE 재조회하여 동일 세트
        // replace-all 을 직렬화한다. 동시 PUT 이 같은 부모의 구성품 집합을 동시에 교체하면
        // 부분 유니크 인덱스(bundle_product_id, component_product_code, is_deleted=false) 경합으로
        // 유니크 500 또는 집합 병합 오염이 발생하므로, 먼저 부모 행을 잠가 순서화한다.
        // (#1 의 DataIntegrityViolation→409 매핑이 보조 방어.)
        Product parent = productRepository.findByIdForUpdate(resolved.getId())
                .orElseThrow(() -> new EntityNotFoundException("품목을 찾을 수 없습니다: " + modelCode));
        String parentModelCode = parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName();

        // 검증 1: BUNDLE 아님 → 409 CONFLICT (D-PCE-01: ResponseStatusException → BusinessException)
        if (parent.getProductType() != ProductType.BUNDLE) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "품목 '" + modelCode + "' 은 BUNDLE 이 아닙니다. 구성품 편집 대상 아님.");
        }

        // #7 전개 불능 세트 가드: 부모 model_code 가 null 이면 expander 가 modelCode-only 로
        // 부모를 해소하지 못해 영구 전개 불능(죽은 세트)이 된다. 구성품 편집을 사전 거부한다.
        if (parent.getModelCode() == null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전개 불능 세트(모델코드 없음) — 구성품 편집 불가: " + modelCode);
        }

        // 검증 2: 빈 배열 → 400 INVALID_INPUT
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품 목록이 비어 있습니다. BUNDLE 세트에는 최소 1개 이상의 구성품이 필요합니다.");
        }

        // 검증 3 + 4 + 5: 자기 자신 포함 / 미해소 코드 / 중복 코드 전건 검증
        // P3-2: 요청 내 중복 componentProductCode 사전 차단 — 부분 유니크 인덱스
        //       (bundle_product_id, component_product_code, is_deleted=false) 위반으로
        //       INSERT 단계에서 500 이 나는 것을 400 으로 선제 거부한다.
        Set<String> seenCodes = new HashSet<>();
        Set<String> duplicateCodes = new LinkedHashSet<>();
        List<String> unresolvedCodes = new ArrayList<>();
        for (BundleComponentRequest req : requests) {
            if (req.componentProductCode().equals(parentModelCode)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "구성품에 자기 자신('" + parentModelCode + "')을 포함할 수 없습니다.");
            }
            if (!seenCodes.add(req.componentProductCode())) {
                duplicateCodes.add(req.componentProductCode());
            }
            // A fix: 전개(expander) 해소 기준과 동일하게 modelCode-only 검증.
            // model_name fallback 을 쓰면 전개 시 못 찾는 레거시 행이 PUT 200 으로 통과해
            // 전표/견적 전개에서 단가 0·productId null silent 방출 → 금액 오류.
            // #3: 이미 조회한 Product 를 받아 BUNDLE 타입이면 세트-안-세트 거부(추가 쿼리 0).
            Optional<Product> componentOpt = productRepository
                    .findByModelCodeAndIsDeletedFalse(req.componentProductCode());
            if (componentOpt.isEmpty()) {
                unresolvedCodes.add(req.componentProductCode());
            } else if (componentOpt.get().getProductType() == ProductType.BUNDLE) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "세트 품목은 구성품으로 등록할 수 없습니다: " + req.componentProductCode());
            }
        }
        if (!duplicateCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품에 중복 모델코드가 있습니다: " + duplicateCodes);
        }
        if (!unresolvedCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "다음 구성 모델코드가 활성 품목으로 해소되지 않습니다: " + unresolvedCodes);
        }

        // 기존 구성품 전량 soft-delete — actor = X-User-Id (P3-3, null/blank → "system")
        String deleteActor = (actor == null || actor.isBlank()) ? "system" : actor;
        List<BundleComponent> existing = bundleComponentRepository.findByBundleProductId(parent.getId());
        for (BundleComponent bc : existing) {
            bc.markDeleted(deleteActor);
            bundleComponentRepository.save(bc);
        }
        // P1-D: soft-delete UPDATE 를 INSERT 보다 먼저 flush — 부분 유니크 인덱스(is_deleted=false) 위반 방지.
        // Hibernate 는 기본적으로 세션 flush 순서를 INSERT→UPDATE 로 처리하여 동일 코드 재INSERT 시
        // (bundle_product_id, component_product_code, is_deleted=false) 중복으로 500 을 유발한다.
        entityManager.flush();

        // 신규 구성품 INSERT (배열 인덱스 = display_order 1-based)
        List<BundleComponent> saved = new ArrayList<>(requests.size());
        for (int idx = 0; idx < requests.size(); idx++) {
            BundleComponentRequest req = requests.get(idx);
            BundleComponent.QtyMode qtyMode = req.qtyMode() != null
                    ? req.qtyMode() : BundleComponent.QtyMode.FOLLOW_SET;
            BundleComponent.ComponentKind kind = req.componentKind() != null
                    ? req.componentKind() : BundleComponent.ComponentKind.ACCESSORY;
            BundleComponent bc = BundleComponent.seed(
                    parent.getId(),
                    req.componentProductCode(),
                    req.defaultQty(),
                    qtyMode,
                    kind,
                    blankToNull(req.componentVariant()),
                    req.isDefault(),
                    blankToNull(req.specText())
            );
            bc.changeDisplayOrder(idx + 1); // 1-based 표시 순서 기록 (P2-4)
            saved.add(bundleComponentRepository.save(bc));
        }

        // 구성품 명칭 벌크 조회 (D-PCE-03 패턴 동일: modelCode → modelName 2차 fallback)
        List<String> codes = saved.stream().map(BundleComponent::getComponentProductCode).toList();
        Map<String, String> nameByCode = new HashMap<>();
        productRepository.findByModelCodeInAndIsDeletedFalse(codes)
                .forEach(p -> nameByCode.put(p.getModelCode(), p.getName()));
        List<String> unresolvedForName = codes.stream()
                .filter(c -> !nameByCode.containsKey(c))
                .distinct()
                .toList();
        for (String code : unresolvedForName) {
            productRepository.findByModelNameAndIsDeletedFalse(code)
                    .ifPresent(p -> nameByCode.put(code, p.getName()));
        }

        List<BundleComponentResponse> result = new ArrayList<>(saved.size());
        for (int i = 0; i < saved.size(); i++) {
            BundleComponent bc = saved.get(i);
            String name = nameByCode.getOrDefault(bc.getComponentProductCode(),
                    bc.getComponentProductCode());
            result.add(BundleComponentResponse.from(bc, name, i + 1));
        }

        // §2-2 실시간 publish — components PUT 성공 시 카탈로그 목록 invalidate 트리거
        // P3-1: afterCommit 지연 발화로 통일 (롤백 시 헛이벤트 방지)
        catalogChangePublisher.publishCatalogChanged(modelCode);

        return result;
    }

    /**
     * 세트구성품 수기 등록 직후 부모 BUNDLE 에 구성품 1건을 추가한다.
     *
     * <p>검증 기준은 {@link #replaceComponents(String, List, String)} 와 맞춘다.
     * 부모는 카탈로그 노출 식별자(modelCode, 없으면 modelName fallback)로 해소하고,
     * 구성품은 전개 경로와 동일하게 {@code products.model_code} 정확 매칭으로 검증한다.
     *
     * @param parentSetModelCode 부모 세트의 노출 모델코드
     * @param componentProductCode 신규 구성품의 modelCode
     * @param componentKind 구성품 구분(null 이면 ACCESSORY)
     * @return 저장된 BundleComponent
     * @throws BusinessException(INVALID_INPUT) 부모 누락/비세트/자기참조/세트-안-세트/중복/미해소 구성품
     */
    @Transactional
    public BundleComponent addRegisteredComponent(String parentSetModelCode,
                                                  String componentProductCode,
                                                  BundleComponent.ComponentKind componentKind) {
        Product parent = validateRegisteredComponent(parentSetModelCode, componentProductCode);
        String parentModelCode = parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName();

        boolean duplicate = bundleComponentRepository.findByBundleProductId(parent.getId()).stream()
                .anyMatch(existing -> componentProductCode.equals(existing.getComponentProductCode()));
        if (duplicate) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품에 중복 모델코드가 있습니다: " + componentProductCode);
        }

        BundleComponent saved = bundleComponentRepository.save(BundleComponent.seed(
                parent.getId(),
                componentProductCode,
                BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET,
                componentKind == null ? BundleComponent.ComponentKind.ACCESSORY : componentKind,
                null,
                false,
                null));
        catalogChangePublisher.publishCatalogChanged(parentModelCode);
        return saved;
    }

    /**
     * PATCH 경로에서 세트구성품 부모 링크를 지정 부모 1건으로 맞춘다.
     *
     * <p>같은 부모 링크가 이미 있으면 속성만 정규화하고, 다른 부모 링크는 soft-delete 한다.
     * 생성 경로의 중복 거부와 달리 PATCH 는 "최종 상태"를 맞추는 동작이다.
     */
    @Transactional
    public BundleComponent replaceRegisteredComponentLink(String parentSetModelCode,
                                                          String componentProductCode,
                                                          BundleComponent.ComponentKind componentKind,
                                                          String actor) {
        Product parent = validateRegisteredComponent(parentSetModelCode, componentProductCode);
        String deleteActor = actor == null || actor.isBlank() ? "system" : actor;
        List<BundleComponent> existingLinks = bundleComponentRepository.findByComponentProductCode(componentProductCode);
        BundleComponent sameParent = null;
        for (BundleComponent existing : existingLinks) {
            if (existing.getBundleProductId().equals(parent.getId())) {
                sameParent = existing;
            } else {
                existing.markDeleted(deleteActor);
                bundleComponentRepository.save(existing);
            }
        }
        entityManager.flush();

        if (sameParent != null) {
            sameParent.changeAttributes(
                    BigDecimal.ONE,
                    BundleComponent.QtyMode.FOLLOW_SET,
                    componentKind == null ? BundleComponent.ComponentKind.ACCESSORY : componentKind,
                    null,
                    false,
                    null);
            catalogChangePublisher.publishCatalogChanged(
                    parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName());
            return sameParent;
        }
        BundleComponent saved = bundleComponentRepository.save(BundleComponent.seed(
                parent.getId(),
                componentProductCode,
                BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET,
                componentKind == null ? BundleComponent.ComponentKind.ACCESSORY : componentKind,
                null,
                false,
                null));
        catalogChangePublisher.publishCatalogChanged(
                parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName());
        return saved;
    }

    /**
     * 구성품에서 일반/세트로 전환될 때 기존 부모 링크를 모두 soft-delete 한다.
     */
    @Transactional
    public void removeRegisteredComponentLinks(String componentProductCode, String actor) {
        if (componentProductCode == null || componentProductCode.isBlank()) {
            return;
        }
        String deleteActor = actor == null || actor.isBlank() ? "system" : actor;
        List<BundleComponent> existingLinks = bundleComponentRepository.findByComponentProductCode(componentProductCode);
        for (BundleComponent existing : existingLinks) {
            existing.markDeleted(deleteActor);
            bundleComponentRepository.save(existing);
        }
        if (!existingLinks.isEmpty()) {
            entityManager.flush();
            catalogChangePublisher.publishCatalogChanged();
        }
    }

    private Product validateRegisteredComponent(String parentSetModelCode, String componentProductCode) {
        if (parentSetModelCode == null || parentSetModelCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "세트구성품은 부모 세트 모델코드가 필수입니다");
        }
        if (componentProductCode == null || componentProductCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "구성품 모델코드가 비어 있습니다");
        }

        Product parent = productRepository
                .findByCatalogExposedModelCodeAndIsDeletedFalse(parentSetModelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                        "부모 세트 모델코드를 찾을 수 없습니다: " + parentSetModelCode));
        if (parent.getProductType() != ProductType.BUNDLE) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "부모 품목은 BUNDLE 이어야 합니다: " + parentSetModelCode);
        }

        String parentModelCode = parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName();
        if (componentProductCode.equals(parentModelCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품에 자기 자신('" + parentModelCode + "')을 포함할 수 없습니다.");
        }

        Product component = productRepository.findByModelCodeAndIsDeletedFalse(componentProductCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                        "구성 모델코드가 활성 품목으로 해소되지 않습니다: " + componentProductCode));
        if (component.getProductType() == ProductType.BUNDLE) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 구성품으로 등록할 수 없습니다: " + componentProductCode);
        }
        return parent;
    }

    // ============================================================
    // §1d 표시 순서 일괄 갱신
    // ============================================================

    /**
     * 품목 표시 순서 일괄 갱신 (§1d 2026-06-11 + D-PCE-02 카테고리 검증 축 교체).
     *
     * <p>전건 검증 후 일괄 적용 — 부분 적용 금지, 단일 트랜잭션.
     * 미존재 modelCode 가 하나라도 있으면 {@link EntityNotFoundException}(→ 404) 을 던진다.
     *
     * <p><b>요청 내 중복 modelCode 검증 (H fix, 2026-06-11)</b>:
     * 같은 modelCode 가 두 번 들어오면 마지막 값으로 덮어써 의도와 다른 순서가 저장되므로,
     * {@code replaceComponents} 의 {@code duplicateCodes(LinkedHashSet)} 패턴을 재사용해
     * 전건 검증 단계(적용 전)에서 중복을 검출하고 400 {@code INVALID_INPUT} 으로 거부한다.
     *
     * <p><b>카테고리 동일 검증 (D-PCE-02 + G fix, 2026-06-11)</b>:
     * 검증 기준 축은 {@link EstimateCategory} — FE 카탈로그 카테고리 선택과 동일하다.
     * {@code findExposedCatalog} 는 실제로 {@link com.samhanair.logis.product.domain.ProductCategory}
     * (별개 enum) 로 WHERE/ORDER BY 하므로 '동일 차원' 이 아니다(G fix — 허위 문구 제거).
     * 시트 기본 적재 데이터는 productCategory↔estimateCategory 가 1:1 이나 수동 override
     * (markUsageManual) 시 desync 가능하다. display_order 충돌은 {@code findExposedCatalog} 의
     * {@code modelCode ASC} 타이브레이커로 결정적 해소된다.
     * <ul>
     *   <li>null {@code estimateCategory} 군은 자체 군으로 허용 (null끼리 OK)</li>
     *   <li>null + non-null 혼합 → 400 {@code INVALID_INPUT}</li>
     *   <li>서로 다른 non-null 값 혼합 → 400 {@code INVALID_INPUT}</li>
     * </ul>
     *
     * <p>성공 시 {@code product:catalog:changed} 이벤트 broadcast — FE 카탈로그 목록 invalidate 트리거.
     *
     * @param requests modelCode + displayOrder 목록
     * @throws BusinessException(INVALID_INPUT) 중복 modelCode / 다른 estimateCategory 혼합 / null+non-null 혼합 시
     * @throws EntityNotFoundException          404 — 미존재 modelCode 포함 시
     */
    @Transactional
    public void updateDisplayOrders(List<DisplayOrderRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }

        // H fix: 요청 내 중복 modelCode 사전 차단 (replaceComponents duplicateCodes 패턴 재사용).
        // 같은 modelCode 가 두 번 들어오면 마지막 값으로 덮어써 의도와 다른 순서가 저장된다.
        Set<String> seenModelCodes = new HashSet<>();
        Set<String> duplicateModelCodes = new LinkedHashSet<>();
        for (DisplayOrderRequest req : requests) {
            if (!seenModelCodes.add(req.modelCode())) {
                duplicateModelCodes.add(req.modelCode());
            }
        }
        if (!duplicateModelCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "표시 순서 갱신에 중복 modelCode 가 있습니다: " + duplicateModelCodes);
        }

        // 전건 검증 — 미존재 코드가 있으면 즉시 404.
        // #5 N+1 제거: 항목별 findByCatalogExposedModelCodeAndIsDeletedFalse(최대 2쿼리/항목) 루프를
        // 벌크화한다. 1차 modelCode IN 1쿼리 + 미해소분 modelName IN 1쿼리로 Map 을 구성하고,
        // 요청 순서(인덱스)를 보존하며 매칭한다(원자 적용이 requests[i]↔products[i] 정합에 의존).
        List<String> requestedCodes = requests.stream()
                .map(DisplayOrderRequest::modelCode)
                .toList();

        Map<String, Product> byModelCode = new HashMap<>();
        productRepository.findByModelCodeInAndIsDeletedFalse(requestedCodes)
                .forEach(p -> byModelCode.putIfAbsent(p.getModelCode(), p));

        // 1차(modelCode) 미해소 식별자 → modelName IN 2차 조회 (catalog fallback 벌크화)
        List<String> unresolvedForName = requestedCodes.stream()
                .filter(code -> !byModelCode.containsKey(code))
                .distinct()
                .toList();
        Map<String, Product> byModelName = new HashMap<>();
        if (!unresolvedForName.isEmpty()) {
            productRepository.findByModelNameInAndIsDeletedFalse(unresolvedForName)
                    .forEach(p -> byModelName.putIfAbsent(p.getModelName(), p));
        }

        // 요청 순서 보존 매칭 — 미존재 시 기존과 동일하게 404(EntityNotFoundException)
        List<Product> products = new ArrayList<>(requests.size());
        for (DisplayOrderRequest req : requests) {
            Product p = byModelCode.get(req.modelCode());
            if (p == null) {
                p = byModelName.get(req.modelCode());
            }
            if (p == null) {
                throw new EntityNotFoundException("품목을 찾을 수 없습니다: " + req.modelCode());
            }
            products.add(p);
        }

        // D-PCE-02: estimateCategory 기준 동일 군 검증
        // null 군 자체는 허용, null+non-null 혼합 또는 서로 다른 non-null → 400
        if (products.size() > 1) {
            EstimateCategory firstCategory = products.get(0).getEstimateCategory();
            boolean firstIsNull = (firstCategory == null);

            for (Product p : products) {
                EstimateCategory pCategory = p.getEstimateCategory();
                boolean pIsNull = (pCategory == null);

                // null + non-null 혼합
                if (firstIsNull != pIsNull) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "표시 순서 일괄 갱신은 동일 견적 카테고리(estimateCategory) 품목만 허용됩니다. "
                            + "null 카테고리와 분류된 카테고리가 혼합되어 있습니다: "
                            + buildModelCodeList(products));
                }
                // 서로 다른 non-null
                if (!firstIsNull && !Objects.equals(pCategory, firstCategory)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "표시 순서 일괄 갱신은 동일 견적 카테고리(estimateCategory) 품목만 허용됩니다. "
                            + "요청에 다른 카테고리 품목이 섞여 있습니다: "
                            + buildModelCodeList(products));
                }
            }
        }

        // 일괄 적용
        for (int i = 0; i < products.size(); i++) {
            products.get(i).changeDisplayOrder(requests.get(i).displayOrder());
            productRepository.save(products.get(i));
        }

        // §2-2 실시간 publish — display-orders PUT 성공 시 카탈로그 목록 invalidate 트리거
        // P3-1: afterCommit 지연 발화로 통일 (롤백 시 헛이벤트 방지)
        catalogChangePublisher.publishCatalogChanged();
    }

    // ============================================================
    // 내부 유틸
    // ============================================================

    private Product findProductByModelCodeOrThrow(String modelCode) {
        return productRepository
                .findByCatalogExposedModelCodeAndIsDeletedFalse(modelCode)
                .orElseThrow(() -> new EntityNotFoundException("품목을 찾을 수 없습니다: " + modelCode));
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static String buildModelCodeList(List<Product> products) {
        return products.stream()
                .map(x -> x.getModelCode() != null ? x.getModelCode() : x.getModelName())
                .collect(Collectors.joining(", "));
    }
}
