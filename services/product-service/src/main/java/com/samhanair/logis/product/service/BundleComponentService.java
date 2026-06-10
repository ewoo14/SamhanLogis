package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import jakarta.persistence.EntityNotFoundException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
 * <p><b>display-orders 카테고리 검증 축 (D-PCE-02 fix)</b>:
 * 검증 기준은 {@link EstimateCategory} — FE 카테고리 선택 및
 * {@code findExposedCatalog} 정렬 군과 동일 차원.
 * null {@code estimateCategory} 군은 자체 군으로 허용(null끼리 OK),
 * null + non-null 혼합은 400, 서로 다른 non-null 혼합도 400.
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
    private final ProductRealtimeBroker broker;

    public BundleComponentService(ProductRepository productRepository,
                                  BundleComponentRepository bundleComponentRepository,
                                  ProductRealtimeBroker broker) {
        this.productRepository = productRepository;
        this.bundleComponentRepository = bundleComponentRepository;
        this.broker = broker;
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
     * <p>검증 순서:
     * <ol>
     *   <li>대상 품목이 BUNDLE 아님 → 409 CONFLICT</li>
     *   <li>빈 배열 → 400 BAD_REQUEST (전개 불능 세트 방지)</li>
     *   <li>자기 자신 modelCode 포함 → 400 BAD_REQUEST</li>
     *   <li>구성 모델코드가 활성 품목으로 해소 안 됨 → 400 BAD_REQUEST</li>
     * </ol>
     * 전건 검증 후 기존 구성품 전체 soft-delete → 신규 구성품 INSERT.
     * 트랜잭션 단일(부분 적용 금지).
     *
     * <p>BundleExpander 는 캐시를 두지 않으므로 evict 불필요.
     *
     * @param modelCode 대상 BUNDLE 모델코드
     * @param requests  replace-all 구성품 목록 (배열 인덱스 = 표시 순서)
     * @return 갱신된 구성품 응답 목록
     * @throws BusinessException(CONFLICT)      대상 품목이 BUNDLE 이 아닌 경우
     * @throws BusinessException(INVALID_INPUT) 빈 배열 / 자기 자신 포함 / 미해소 코드
     */
    @Transactional
    public List<BundleComponentResponse> replaceComponents(String modelCode,
                                                           List<BundleComponentRequest> requests) {
        Product parent = findProductByModelCodeOrThrow(modelCode);
        String parentModelCode = parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName();

        // 검증 1: BUNDLE 아님 → 409 CONFLICT (D-PCE-01: ResponseStatusException → BusinessException)
        if (parent.getProductType() != ProductType.BUNDLE) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "품목 '" + modelCode + "' 은 BUNDLE 이 아닙니다. 구성품 편집 대상 아님.");
        }

        // 검증 2: 빈 배열 → 400 INVALID_INPUT
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품 목록이 비어 있습니다. BUNDLE 세트에는 최소 1개 이상의 구성품이 필요합니다.");
        }

        // 검증 3 + 4: 자기 자신 포함 / 미해소 코드 전건 검증
        List<String> unresolvedCodes = new ArrayList<>();
        for (BundleComponentRequest req : requests) {
            if (req.componentProductCode().equals(parentModelCode)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "구성품에 자기 자신('" + parentModelCode + "')을 포함할 수 없습니다.");
            }
            boolean resolved = productRepository
                    .findByCatalogExposedModelCodeAndIsDeletedFalse(req.componentProductCode())
                    .isPresent();
            if (!resolved) {
                unresolvedCodes.add(req.componentProductCode());
            }
        }
        if (!unresolvedCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "다음 구성 모델코드가 활성 품목으로 해소되지 않습니다: " + unresolvedCodes);
        }

        // 기존 구성품 전량 soft-delete
        List<BundleComponent> existing = bundleComponentRepository.findByBundleProductId(parent.getId());
        for (BundleComponent bc : existing) {
            bc.markDeleted("bundle-component-replace-all");
            bundleComponentRepository.save(bc);
        }

        // 신규 구성품 INSERT
        List<BundleComponent> saved = new ArrayList<>(requests.size());
        for (BundleComponentRequest req : requests) {
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
        broker.publish(CATALOG_CHANNEL_ID, EVENT_CATALOG_CHANGED,
                Map.of("event", EVENT_CATALOG_CHANGED, "modelCode", modelCode));

        return result;
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
     * <p><b>카테고리 동일 검증 (D-PCE-02 fix, 2026-06-11)</b>:
     * 검증 기준 축은 {@link EstimateCategory} — FE 카탈로그 카테고리 선택 및
     * {@code findExposedCatalog} 정렬 군과 동일 차원.
     * <ul>
     *   <li>null {@code estimateCategory} 군은 자체 군으로 허용 (null끼리 OK)</li>
     *   <li>null + non-null 혼합 → 400 {@code INVALID_INPUT}</li>
     *   <li>서로 다른 non-null 값 혼합 → 400 {@code INVALID_INPUT}</li>
     * </ul>
     *
     * <p>성공 시 {@code product:catalog:changed} 이벤트 broadcast — FE 카탈로그 목록 invalidate 트리거.
     *
     * @param requests modelCode + displayOrder 목록
     * @throws BusinessException(INVALID_INPUT) 다른 estimateCategory 혼합 / null+non-null 혼합 시
     * @throws EntityNotFoundException          404 — 미존재 modelCode 포함 시
     */
    @Transactional
    public void updateDisplayOrders(List<DisplayOrderRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }

        // 전건 검증 — 미존재 코드가 있으면 즉시 404
        List<Product> products = new ArrayList<>(requests.size());
        for (DisplayOrderRequest req : requests) {
            Product p = productRepository
                    .findByCatalogExposedModelCodeAndIsDeletedFalse(req.modelCode())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "품목을 찾을 수 없습니다: " + req.modelCode()));
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
        broker.publish(CATALOG_CHANNEL_ID, EVENT_CATALOG_CHANGED,
                Map.of("event", EVENT_CATALOG_CHANGED));
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
