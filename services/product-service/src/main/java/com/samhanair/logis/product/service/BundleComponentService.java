package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import jakarta.persistence.EntityNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
     * 구성품 modelCode → 품목 명칭 IN 벌크 조회로 N+1 을 방지한다.
     *
     * @param modelCode 카탈로그 노출 식별자
     * @return 구성품 응답 목록 (표시 순서 = 리스트 인덱스, 1-based 반환)
     */
    @Transactional(readOnly = true)
    public List<BundleComponentResponse> listComponents(String modelCode) {
        Product product = findProductByModelCodeOrThrow(modelCode);
        List<BundleComponent> components = bundleComponentRepository
                .findByBundleProductId(product.getId());

        // 구성품 modelCode 집합으로 명칭 벌크 조회 (N+1 방지)
        List<String> componentCodes = components.stream()
                .map(BundleComponent::getComponentProductCode)
                .toList();
        Map<String, String> nameByCode = productRepository
                .findByModelCodeInAndIsDeletedFalse(componentCodes)
                .stream()
                .collect(Collectors.toMap(Product::getModelCode, Product::getName));

        List<BundleComponentResponse> result = new ArrayList<>(components.size());
        for (int i = 0; i < components.size(); i++) {
            BundleComponent bc = components.get(i);
            String name = nameByCode.get(bc.getComponentProductCode());
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
     */
    @Transactional
    public List<BundleComponentResponse> replaceComponents(String modelCode,
                                                           List<BundleComponentRequest> requests) {
        Product parent = findProductByModelCodeOrThrow(modelCode);
        String parentModelCode = parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName();

        // 검증 1: BUNDLE 아님 → 409
        if (parent.getProductType() != ProductType.BUNDLE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "품목 '" + modelCode + "' 은 BUNDLE 이 아닙니다. 구성품 편집 대상 아님.");
        }

        // 검증 2: 빈 배열 → 400
        if (requests == null || requests.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "구성품 목록이 비어 있습니다. BUNDLE 세트에는 최소 1개 이상의 구성품이 필요합니다.");
        }

        // 검증 3 + 4: 자기 자신 포함 / 미해소 코드 전건 검증
        List<String> unresolvedCodes = new ArrayList<>();
        for (BundleComponentRequest req : requests) {
            if (req.componentProductCode().equals(parentModelCode)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
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

        // 구성품 명칭 벌크 조회
        List<String> codes = saved.stream().map(BundleComponent::getComponentProductCode).toList();
        Map<String, String> nameByCode = productRepository.findByModelCodeInAndIsDeletedFalse(codes)
                .stream().collect(Collectors.toMap(Product::getModelCode, Product::getName));

        List<BundleComponentResponse> result = new ArrayList<>(saved.size());
        for (int i = 0; i < saved.size(); i++) {
            BundleComponent bc = saved.get(i);
            result.add(BundleComponentResponse.from(bc, nameByCode.get(bc.getComponentProductCode()), i + 1));
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
     * 품목 표시 순서 일괄 갱신 (§1d 2026-06-11 + §2-1 카테고리 동일 검증).
     *
     * <p>전건 검증 후 일괄 적용 — 부분 적용 금지, 단일 트랜잭션.
     * 미존재 modelCode 가 하나라도 있으면 {@link EntityNotFoundException}(→ 404) 을 던진다.
     *
     * <p><b>카테고리 동일 검증 (§2-1 2026-06-11)</b>:
     * {@code displayOrder} 는 카테고리 내 정렬이므로 ({@code findExposedCatalog} 소비)
     * 요청 품목들이 모두 동일한 {@link ProductCategory} 에 속해야 한다.
     * 다른 카테고리가 섞이면 전역 재번호 혼용이 발생하므로 400 {@code INVALID_INPUT} 반환.
     * {@code productCategory == null} 품목이 섞인 경우도 동일 처리 (카테고리 미분류 혼용 금지).
     *
     * <p>sync displayOrder 보존 가드 불요 — 시트 전용 정책(비상 재적재 시 시트 기준 재시드 의도 동작).
     * 성공 시 {@code product:catalog:changed} 이벤트 broadcast — FE 카탈로그 목록 invalidate 트리거.
     *
     * @param requests modelCode + displayOrder 목록
     * @throws ResponseStatusException 400 INVALID_INPUT — 다른 카테고리 혼합 시
     * @throws EntityNotFoundException 404 — 미존재 modelCode 포함 시
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

        // §2-1 카테고리 동일 검증 — displayOrder 는 카테고리 내 정렬 (전역 재번호 금지)
        if (products.size() > 1) {
            ProductCategory firstCategory = products.get(0).getProductCategory();
            for (Product p : products) {
                if (!Objects.equals(p.getProductCategory(), firstCategory)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "표시 순서 일괄 갱신은 동일 카테고리 품목만 허용됩니다. "
                            + "요청에 다른 카테고리 품목이 섞여 있습니다: "
                            + products.stream()
                                    .map(x -> x.getModelCode() != null ? x.getModelCode() : x.getModelName())
                                    .collect(Collectors.joining(", ")));
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
}
