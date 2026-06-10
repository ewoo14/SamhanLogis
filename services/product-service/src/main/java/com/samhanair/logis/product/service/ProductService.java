package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleIntegrityResponse;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 제품 CRUD + lookup batch + 가격/태그/단종 부분수정. 트랜잭션 경계는 서비스 메서드.
 * 비즈니스 규칙은 도메인 메서드에 위임 (가격 음수 검증 등은 {@link Product#create} 등에서).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class ProductService {

    private static final int LOOKUP_MAX = 100;

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final BundleComponentRepository bundleComponentRepository;

    /**
     * rowHash 캐시 evict 를 위해 직접 주입.
     * ProductSheetSyncService → ProductService 방향의 의존이 없으므로 순환 없음.
     */
    private final ProductSheetSyncService productSheetSyncService;

    /**
     * 품목 목록 검색 — categoryId/status/tag/q 필터 기존 유지 + usageScope/productCategory 신규 AND 결합.
     *
     * <p>PR-B(2026-06-11) 확장: order-app 이 {@code ?usageScope=PARTNER_ORDER&category=HOME_MULTI} 로
     * 호출하고, desktop sales.ts 가 {@code usageScope=BOTH&category=...} 로 호출하던 파라미터가
     * 이제 실효화된다. {@code category} 파라미터는 {@link ProductCategory} enum 문자열 바인딩.
     *
     * @param categoryId      카테고리 UUID 필터 (null = 전체)
     * @param status          제품 상태 필터 (null = 전체)
     * @param tagKey          태그 키 필터 (null = 미사용)
     * @param tagValue        태그 값 필터 (tagKey 와 쌍)
     * @param q               자유 텍스트 검색 (name/modelName LIKE)
     * @param usageScope      노출 범위 필터 (null = 전체)
     * @param productCategory 품목 카테고리 필터 (null = 전체, {@link ProductCategory} enum)
     * @param pageable        페이징 정보
     * @return 조건에 맞는 품목 요약 페이지
     */
    @Transactional(readOnly = true)
    public Page<ProductSummaryResponse> search(UUID categoryId,
                                               ProductStatus status,
                                               String tagKey,
                                               String tagValue,
                                               String q,
                                               UsageScope usageScope,
                                               ProductCategory productCategory,
                                               Pageable pageable) {
        String tagFilter = buildTagFilter(tagKey, tagValue);
        String statusName = status == null ? null : status.name();
        String qNormalised = (q == null || q.isBlank()) ? null : q.trim();
        String usageScopeName = usageScope == null ? null : usageScope.name();
        String productCategoryName = productCategory == null ? null : productCategory.name();
        return productRepository
                .search(categoryId, statusName, qNormalised, tagFilter, usageScopeName, productCategoryName, pageable)
                .map(ProductSummaryResponse::from);
    }

    /**
     * 기존 search 시그니처 — backward-compat (usageScope/productCategory 없음).
     *
     * @deprecated 신규 코드는 {@link #search(UUID, ProductStatus, String, String, String, UsageScope, ProductCategory, Pageable)} 사용.
     */
    @Deprecated
    @Transactional(readOnly = true)
    public Page<ProductSummaryResponse> search(UUID categoryId,
                                               ProductStatus status,
                                               String tagKey,
                                               String tagValue,
                                               String q,
                                               Pageable pageable) {
        return search(categoryId, status, tagKey, tagValue, q, null, null, pageable);
    }

    @Transactional(readOnly = true)
    public ProductResponse getOne(UUID id) {
        return ProductResponse.from(loadOrThrow(id));
    }

    /**
     * 모델명 정확 매칭 단건 조회 — Slip 출력 슬라이스의 modelName onBlur lookup 에서 사용.
     * product-service 내부에서 Product 도메인 객체를 반환 (호출자가 ProductSummaryResponse /
     * ProductResponse 변환 책임).
     *
     * @param modelName 정확 매칭할 모델명 (null/blank 면 INVALID_INPUT)
     * @return 일치 Product 도메인 객체
     * @throws BusinessException(INVALID_INPUT) modelName null/blank
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     */
    @Transactional(readOnly = true)
    public Product findByModelNameOrThrow(String modelName) {
        if (modelName == null || modelName.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "모델명이 비어있습니다");
        }
        return productRepository.findByModelNameAndIsDeletedFalse(modelName.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "모델명에 해당하는 제품이 없습니다"));
    }

    /**
     * 모델명 정확 매칭 단건 조회 후 ProductSummaryResponse 로 변환.
     * Internal endpoint 전용 경로 (slip-service ProductClient 가 호출).
     *
     * @param modelName 정확 매칭할 모델명
     * @return ProductSummaryResponse (id/name/modelName/categoryId/sellingPrice/status)
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     */
    @Transactional(readOnly = true)
    public ProductSummaryResponse lookupSummaryByModelName(String modelName) {
        return ProductSummaryResponse.from(findByModelNameOrThrow(modelName));
    }

    /**
     * 제품명 정확 매칭 단건 조회 후 ProductSummaryResponse 로 변환.
     * MIG-5 이카운트 창고이동 raw 품목명 lookup 의 service-to-service 경로다.
     *
     * @param name 정확 매칭할 제품명
     * @return ProductSummaryResponse
     * @throws BusinessException(INVALID_INPUT) name null/blank
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     * @throws BusinessException(CONFLICT) 동일 제품명 활성 row 2건 이상
     */
    @Transactional(readOnly = true)
    public ProductSummaryResponse lookupSummaryByName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "제품명이 비어있습니다");
        }
        List<Product> rows = productRepository.findByNameAndIsDeletedFalse(name.trim());
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "제품명에 해당하는 제품이 없습니다");
        }
        if (rows.size() > 1) {
            throw new BusinessException(ErrorCode.CONFLICT, "제품명 중복 매칭: " + name.trim());
        }
        return ProductSummaryResponse.from(rows.get(0));
    }

    /**
     * 품목코드(product_code) 정확 매칭 단건 조회 후 ProductSummaryResponse 로 변환.
     * S3 인스턴스 출고 예약에서 productCode 기반 serialManaged 확인에 사용한다.
     *
     * @param productCode 정확 매칭할 품목코드
     * @return ProductSummaryResponse
     * @throws BusinessException(INVALID_INPUT) productCode null/blank
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     */
    @Transactional(readOnly = true)
    public ProductSummaryResponse lookupSummaryByProductCode(String productCode) {
        if (productCode == null || productCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "품목코드가 비어있습니다");
        }
        Product product = productRepository.findByProductCodeAndIsDeletedFalse(productCode.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "품목코드에 해당하는 제품이 없습니다"));
        return ProductSummaryResponse.from(product);
    }

    /**
     * 모델명 정확 매칭 단건 조회 후 ProductResponse(상세) 로 변환.
     * Public endpoint 전용 경로 (gateway 경유 FE 호출).
     *
     * @param modelName 정확 매칭할 모델명
     * @return ProductResponse (audit + tags 포함 상세)
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     */
    @Transactional(readOnly = true)
    public ProductResponse getByModelName(String modelName) {
        return ProductResponse.from(findByModelNameOrThrow(modelName));
    }

    @Transactional(readOnly = true)
    public List<ProductSummaryResponse> lookup(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 제품 ID가 비어있습니다");
        }
        if (ids.size() > LOOKUP_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 " + LOOKUP_MAX + "건입니다");
        }
        return productRepository.findAllByIdIn(ids).stream()
                .map(ProductSummaryResponse::from)
                .toList();
    }

    /**
     * 세트(BUNDLE) 구성품 정합 점검 — 운영 전/시트 sync 후 재실행용.
     *
     * <p>모든 활성 BUNDLE 의 구성품 중 활성 품목으로 해소되지 않는(미등록/단종) 것을 세트별로 모은다.
     * {@link com.samhanair.logis.product.service.BundleExpander#expand} 의 해소 경로와 동일 기준이므로,
     * {@code healthy=false} 인 세트는 견적/전표 전개 시 NOT_FOUND 로 거부된다.
     *
     * @return 정합 점검 결과 (healthy + 세트별 미해소 구성품 목록)
     */
    @Transactional(readOnly = true)
    public BundleIntegrityResponse checkBundleIntegrity() {
        long totalBundles = productRepository.countByProductTypeAndIsDeletedFalse(ProductType.BUNDLE);
        List<BundleComponent> unresolved = bundleComponentRepository.findUnresolvedComponents();

        // 부모 BUNDLE 단위로 그룹핑 (입력 순서 = bundleProductId, componentProductCode ORDER BY 유지)
        Map<UUID, List<BundleComponent>> byBundle = new LinkedHashMap<>();
        for (BundleComponent bc : unresolved) {
            byBundle.computeIfAbsent(bc.getBundleProductId(), k -> new ArrayList<>()).add(bc);
        }

        // 부모 modelCode/name 일괄 조회 (UUID 비공개 — 응답엔 modelCode/name 만)
        Map<UUID, Product> parents = productRepository.findAllByIdIn(byBundle.keySet()).stream()
                .collect(java.util.stream.Collectors.toMap(Product::getId, p -> p));

        List<BundleIntegrityResponse.BundleIssue> issues = new ArrayList<>();
        for (Map.Entry<UUID, List<BundleComponent>> e : byBundle.entrySet()) {
            Product parent = parents.get(e.getKey());
            // 쿼리가 부모=활성 BUNDLE 인 구성품만 반환하므로 parent 는 항상 존재.
            // 방어적 fallback 도 UUID 미노출 ([[feedback_uuid_no_user_visibility]]).
            String parentModel = parent != null ? parent.getModelCode() : "(미상 부모)";
            String parentName = parent != null ? parent.getName() : null;
            List<BundleIntegrityResponse.UnresolvedComponent> comps = e.getValue().stream()
                    .map(c -> new BundleIntegrityResponse.UnresolvedComponent(
                            c.getComponentProductCode(),
                            c.getComponentKind() == null ? null : c.getComponentKind().name()))
                    .toList();
            issues.add(new BundleIntegrityResponse.BundleIssue(parentModel, parentName, comps));
        }

        return new BundleIntegrityResponse(
                unresolved.isEmpty(), totalBundles, issues.size(), unresolved.size(), issues);
    }

    public ProductResponse create(CreateProductRequest req) {
        if (productRepository.existsByModelNameAndIsDeletedFalse(req.modelName())) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 모델명입니다: " + req.modelName());
        }
        Category category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "카테고리를 찾을 수 없습니다"));

        try {
            Product saved = productRepository.save(Product.create(
                    req.name(),
                    req.modelName(),
                    category,
                    req.sellingPrice(),
                    req.purchasePrice(),
                    req.currency(),
                    req.tags(),
                    req.description()));
            return ProductResponse.from(saved);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }

    public ProductResponse update(UUID id, UpdateProductRequest req) {
        Product product = loadOrThrow(id);

        if (req.name() != null) {
            product.rename(req.name());
        }
        if (req.modelName() != null && !Objects.equals(req.modelName(), product.getModelName())) {
            if (productRepository.existsByModelNameAndIsDeletedFalse(req.modelName())) {
                throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 모델명입니다: " + req.modelName());
            }
            product.changeModelName(req.modelName());
        }
        if (req.categoryId() != null
                && !Objects.equals(req.categoryId(), product.getCategory().getId())) {
            Category category = categoryRepository.findById(req.categoryId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "카테고리를 찾을 수 없습니다"));
            product.changeCategory(category);
        }
        if (req.description() != null) {
            product.editDescription(req.description());
        }
        return ProductResponse.from(product);
    }

    public ProductResponse updatePrice(UUID id, UpdatePriceRequest req) {
        Product product = loadOrThrow(id);
        try {
            if (req.sellingPrice() != null) {
                product.repriceSelling(req.sellingPrice());
            }
            if (req.purchasePrice() != null) {
                product.repricePurchase(req.purchasePrice());
            }
            if (req.currency() != null) {
                product.changeCurrency(req.currency());
            }
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
        return ProductResponse.from(product);
    }

    public ProductResponse replaceTags(UUID id, Map<String, String> tags) {
        Product product = loadOrThrow(id);
        product.replaceTags(tags);
        return ProductResponse.from(product);
    }

    public void discontinue(UUID id) {
        loadOrThrow(id).discontinue();
    }

    public void reactivate(UUID id) {
        loadOrThrow(id).reactivate();
    }

    /**
     * 품목 노출 범위 수동 override — modelCode 로 품목을 조회하고
     * {@link Product#markUsageManual(UsageScope, EstimateCategory)} 을 호출한다.
     *
     * <p>이후 ProductSheetSyncService sync 에서 이 품목의 usageScope/estimateCategory 는
     * 시트 기준으로 덮어쓰이지 않는다 (displayOrder 는 계속 갱신).
     *
     * @param modelCode 수동 override 대상 품목의 모델코드
     * @param req       새 노출 범위 + 견적 카테고리
     * @return 갱신된 품목 상세 응답
     * @throws BusinessException(NOT_FOUND) modelCode 에 해당하는 품목이 없을 때
     */
    public ProductResponse updateUsage(String modelCode, UpdateProductUsageRequest req) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.markUsageManual(req.usageScope(), req.estimateCategory());
        return ProductResponse.from(product);
    }

    /**
     * 품목 노출 범위 수동 override — 갱신된 {@link Product} 도메인 객체를 직접 반환한다.
     *
     * <p>{@link com.samhanair.logis.product.web.ProductCatalogController#changeUsage} 에서
     * {@link com.samhanair.logis.product.web.dto.ProductCatalogResponse} 로 변환하기 위해
     * 사용한다 (지적 [6][13][32] — 이중 구현 제거).
     *
     * @param modelCode 수동 override 대상 품목의 모델코드
     * @param req       새 노출 범위 + 견적 카테고리
     * @return 갱신된 Product 엔티티 (트랜잭션 내 — 호출자가 DTO 변환)
     * @throws BusinessException(NOT_FOUND) modelCode 에 해당하는 품목이 없을 때
     */
    public Product updateUsageAndReturn(String modelCode, UpdateProductUsageRequest req) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.markUsageManual(req.usageScope(), req.estimateCategory());
        return product;
    }

    /**
     * 품목 노출 범위 수동 override 해제 — modelCode 로 품목을 조회하고
     * {@link Product#clearUsageManual()} 을 호출하여 플래그를 해제한다.
     *
     * <p>플래그 해제 후 다음 ProductSheetSyncService sync 에서 시트 기준으로 재분류된다.
     *
     * <p><b>rowHash 캐시 evict (PR-B 2026-06-11, 지적 [2])</b>:
     * 해제 직후 {@link ProductSheetSyncService#evictRowHash(String)} 를 호출하여 인메모리
     * hash 캐시를 무효화한다. 이 처리가 없으면 행 내용이 변경되지 않은 상태에서 sync 를
     * 재실행해도 {@code unchanged} 분기에 걸려 usageScope 가 시트 기준으로 재분류되지 않는다.
     *
     * @param modelCode override 해제 대상 품목의 모델코드
     * @throws BusinessException(NOT_FOUND) modelCode 에 해당하는 품목이 없을 때
     */
    public void clearUsageOverride(String modelCode) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.clearUsageManual();
        // rowHash 캐시 evict — 다음 sync 에서 unchanged 분기에 걸리지 않고 시트 기준 재분류 보장
        productSheetSyncService.evictRowHash(modelCode);
    }

    public void delete(UUID id, String callerId) {
        Product product = loadOrThrow(id);
        product.markDeleted(callerId == null ? "system" : callerId);
    }

    private Product loadOrThrow(UUID id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "제품을 찾을 수 없습니다"));
    }

    /**
     * modelCode 기반 단건 조회 — catalog 노출 식별자 fallback 규칙 적용
     * (modelCode 없으면 modelName 으로 fallback, {@link ProductRepository#findByCatalogExposedModelCodeAndIsDeletedFalse}).
     *
     * @param modelCode 카탈로그 노출 모델코드
     * @return 활성 Product 엔티티
     * @throws BusinessException(NOT_FOUND) 해당 모델코드의 품목이 없을 때
     */
    private Product loadByModelCodeOrThrow(String modelCode) {
        return productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(modelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "모델코드에 해당하는 품목을 찾을 수 없습니다: " + modelCode));
    }

    /** {@code tagKey=hp&tagValue=1.5} → {@code {"hp":"1.5"}} 의 jsonb literal 문자열로 변환. */
    private String buildTagFilter(String tagKey, String tagValue) {
        if (tagKey == null || tagKey.isBlank()) {
            return null;
        }
        String value = tagValue == null ? "" : tagValue;
        return "{\"" + escape(tagKey) + "\":\"" + escape(value) + "\"}";
    }

    private String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
