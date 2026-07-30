package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductAliasRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.web.dto.BundleIntegrityResponse;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.LabelResolutionResult;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.ProductSpecRequest;
import com.samhanair.logis.product.web.dto.ProductSpecResponse;
import com.samhanair.logis.product.web.dto.UpdateProductClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateProductFixedDiscountRequest;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import com.samhanair.logis.product.web.dto.UpdateProductVariableDiscountRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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

    public static final int LOOKUP_MAX = 100;

    private final ProductRepository productRepository;
    private final ProductSpecRepository productSpecRepository;
    private final ProductEstimateExposureRepository exposureRepository;
    private final ProductAliasRepository productAliasRepository;
    private final CategoryRepository categoryRepository;
    private final ClassificationRepository classificationRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final BundleComponentService bundleComponentService;

    /**
     * rowHash 캐시 evict 를 위해 직접 주입.
     * ProductSheetSyncService → ProductService 방향의 의존이 없으므로 순환 없음.
     */
    private final ProductSheetSyncService productSheetSyncService;

    /**
     * 품목 단종/삭제 전 수량 동기화 규칙 참조 여부 확인용(R1 결함 3). QuantitySyncRuleService
     * → ProductService 방향의 의존이 없으므로(ProductRepository/BundleComponentRepository만
     * 사용) 순환 없음.
     */
    private final QuantitySyncRuleService quantitySyncRuleService;

    /**
     * 품목 목록 검색 — categoryId/status/tag/q 필터 기존 유지 + usageScope/productCategory 신규 AND 결합.
     *
     * <p>{@code /products} (GET) 엔드포인트의 서비스 구현체이다. 이 경로는 어드민/데스크톱 품목관리 화면의
     * 전체 목록 조회에 사용된다. order-app 및 desktop sales.ts 의 노출 필터 조회는
     * {@link com.samhanair.logis.product.web.ProductCatalogController} ({@code /api/v1/products}) 가
     * 담당하므로 두 경로를 혼동하지 않도록 주의할 것.
     *
     * @param categoryId      카테고리 UUID 필터 (null = 전체)
     * @param status          제품 상태 필터 (null = 전체)
     * @param tagKey          태그 키 필터 (null = 미사용)
     * @param tagValue        태그 값 필터 (tagKey 와 쌍)
     * @param q               자유 텍스트 검색 (name/modelName LIKE). LIKE 와일드카드({@code \}, {@code %}, {@code _})
     *                        은 이 메서드에서 이스케이프한 후 바인딩한다.
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
        String qNormalised = (q == null || q.isBlank()) ? null : escapeLikeWildcards(q.trim());
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
        return toResponse(loadOrThrow(id));
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
     * 품목코드(product_code) 또는 이카운트 alias_code 정확 매칭 단건 조회 후 ProductSummaryResponse 로 변환.
     * S3 인스턴스 출고 예약에서 productCode 기반 serialManaged 확인에 사용한다.
     *
     * @param productCode 정확 매칭할 품목코드 또는 이카운트 순번코드
     * @return ProductSummaryResponse
     * @throws BusinessException(INVALID_INPUT) productCode null/blank
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     */
    @Transactional(readOnly = true)
    public ProductSummaryResponse lookupSummaryByProductCode(String productCode) {
        if (productCode == null || productCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "품목코드가 비어있습니다");
        }
        String normalizedCode = productCode.trim();
        Product product = productRepository.findByProductCodeAndIsDeletedFalse(normalizedCode)
                .or(() -> productAliasRepository.findByAliasCodeAndIsDeletedFalse(normalizedCode)
                        .map(alias -> alias.getMainProduct()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "품목코드 또는 alias에 해당하는 제품이 없습니다"));
        return ProductSummaryResponse.from(product);
    }

    /**
     * 회계 라벨({@code 품목명[규격]})에서 모델 토큰을 추출해 제품 요약을 조회한다.
     *
     * <p>#773 S1b accounting 일마감 재검증 전용 service-to-service 경로였으나, #773 후속 벌크 전환 이후
     * 프로덕션 미호출 경로다. 단건/벌크 parity 앵커, 운영 디버깅, 향후 단건 internal 소비 대비용으로
     * 유지한다. {@link #resolveLabel(String)}
     * 3단 fallback(model_code/model_name exact→alias exact→LIKE 단건성) 판정을
     * {@link #lookupSummaryByLabelBulk(List)} 벌크와 공유하며, 단건은 그 판정을 예외로 변환한다
     * (#773 후속 슬라이스 — N+1 HTTP 제거를 위한 리팩터. 판정 로직 자체는 변경 없음).
     *
     * @param label 회계 라인 품목 라벨
     * @return 매칭된 ProductSummaryResponse
     * @throws BusinessException(INVALID_INPUT) 토큰 추출 실패
     * @throws BusinessException(NOT_FOUND) 매칭 제품 없음
     * @throws BusinessException(CONFLICT) LIKE 결과가 2건 이상
     */
    @Transactional(readOnly = true)
    public ProductSummaryResponse lookupSummaryByLabel(String label) {
        LabelResolution resolution = resolveLabel(label);
        return switch (resolution.status()) {
            case BLANK_TOKEN -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "라벨에서 모델코드를 추출할 수 없습니다");
            case NOT_FOUND -> throw new BusinessException(ErrorCode.NOT_FOUND,
                    "라벨에 해당하는 제품이 없습니다");
            case AMBIGUOUS -> throw new BusinessException(ErrorCode.CONFLICT,
                    "라벨 모델코드 중복 매칭: " + resolution.token());
            case MATCHED -> ProductSummaryResponse.from(resolution.product());
        };
    }

    /**
     * 회계 라벨 목록을 일괄 해석한다 (#773 후속 — accounting N+1 HTTP 제거).
     *
     * <p>{@link #lookupSummaryByLabel(String)} 단건과 완전히 동일한 {@link #resolveLabel(String)}
     * 판정 로직을 라벨마다 재사용하되, 미매칭/다의성을 예외로 던지는 대신
     * {@link LabelResolutionResult#status()} 로 보존해 부분 성공(partial success) 계약을 따른다 —
     * 기존 {@code applicable-bulk}/{@code fixed-discount-rate-bulk} 와 동일 철학이다. blank
     * 토큰(추출 실패)은 단건과 동일하게 배치 전체 {@code INVALID_INPUT} 으로 실패한다
     * (순수 배치화 parity).
     *
     * <p>단건과 판정 로직을 100% 공유하므로 동일 라벨에 대해 단건/벌크 결과가 항상 일치한다(parity).
     *
     * @param labels 조회할 라벨(품목명[규격]) 목록. null/빈 목록은 외부 조회 없이 빈 Map 반환
     * @return 라벨 → 해석 결과(Map). 입력 라벨 전부가 키로 포함된다(중복 라벨은 1개 키로 합쳐짐,
     *         키 조회 순서는 최초 등장 순서를 보존한다)
     * @throws BusinessException(INVALID_INPUT) 목록 크기가 {@link #LOOKUP_MAX} 초과
     */
    @Transactional(readOnly = true)
    public Map<String, LabelResolutionResult> lookupSummaryByLabelBulk(List<String> labels) {
        if (labels == null || labels.isEmpty()) {
            return Map.of();
        }
        if (labels.size() > LOOKUP_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 라벨 수는 " + LOOKUP_MAX + "건입니다");
        }
        Map<String, LabelResolutionResult> results = new LinkedHashMap<>();
        for (String label : labels) {
            String key = label == null ? "" : label;
            results.computeIfAbsent(key, k -> {
                LabelResolution resolution = resolveLabel(k);
                if (resolution.status() == LabelMatchStatus.BLANK_TOKEN) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "라벨에서 모델코드를 추출할 수 없습니다: " + k);
                }
                return toLabelResolutionResult(resolution);
            });
        }
        return results;
    }

    /**
     * 회계 라벨 1건을 3단 fallback(catalogExposedModelCode→alias→unique-LIKE)으로 해석한다.
     *
     * <p>{@link #lookupSummaryByLabel(String)} 단건(throw 기반)과 {@link #lookupSummaryByLabelBulk(List)}
     * 벌크(부분 성공 기반)가 공유하는 내부 판정 로직이다 — 두 소비 방식이 항상 같은 판정 결과에서
     * 분기하게 해 parity 를 구조적으로 보장한다(단건 throw ↔ 벌크 status 는 이 메서드 호출 이후에만
     * 갈라진다).
     *
     * @param label 원본 회계 라벨
     * @return 상태 보존 해석 result. {@code BLANK_TOKEN} 은 토큰 추출 실패, {@code AMBIGUOUS} 는
     *         LIKE 후보 2건 이상, 그 외는 {@code NOT_FOUND}/{@code MATCHED}
     */
    private LabelResolution resolveLabel(String label) {
        String token = ModelTokenExtractor.extractModelToken(label);
        if (token.isBlank()) {
            return new LabelResolution(LabelMatchStatus.BLANK_TOKEN, null, token);
        }
        Optional<Product> exact = productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(token)
                .or(() -> productAliasRepository.findByAliasCodeAndIsDeletedFalse(token)
                        .map(alias -> alias.getMainProduct()));
        if (exact.isPresent()) {
            return new LabelResolution(LabelMatchStatus.MATCHED, exact.get(), token);
        }
        Page<Product> page = productRepository.search(null, null, escapeLikeWildcards(token),
                null, null, null, PageRequest.of(0, 2));
        List<Product> rows = page.getContent();
        if (rows.size() > 1) {
            return new LabelResolution(LabelMatchStatus.AMBIGUOUS, null, token);
        }
        return rows.stream().findFirst()
                .map(p -> new LabelResolution(LabelMatchStatus.MATCHED, p, token))
                .orElseGet(() -> new LabelResolution(LabelMatchStatus.NOT_FOUND, null, token));
    }

    /** {@link #resolveLabel(String)} 내부 판정을 벌크 응답 DTO 로 변환한다. */
    private static LabelResolutionResult toLabelResolutionResult(LabelResolution resolution) {
        return switch (resolution.status()) {
            case MATCHED -> new LabelResolutionResult(LabelResolutionResult.MATCHED,
                    resolution.product().getId(), resolution.product().getModelCode());
            case AMBIGUOUS -> new LabelResolutionResult(LabelResolutionResult.AMBIGUOUS, null, null);
            case NOT_FOUND -> new LabelResolutionResult(LabelResolutionResult.NOT_FOUND, null, null);
            case BLANK_TOKEN -> throw new IllegalStateException("BLANK_TOKEN is handled before bulk conversion");
        };
    }

    /** #773 라벨 해석 내부 판정 상태 — {@link #lookupSummaryByLabel(String)} 단건/벌크가 공유. */
    private enum LabelMatchStatus {
        /** 정확히 1건 매칭. */
        MATCHED,
        /** 매칭 제품이 없음. */
        NOT_FOUND,
        /** LIKE 후보 2건 이상으로 다의성. */
        AMBIGUOUS,
        /** {@link ModelTokenExtractor#extractModelToken(String)} 결과가 blank — 토큰 추출 실패. */
        BLANK_TOKEN
    }

    /**
     * #773 라벨 해석 내부 result — {@link #resolveLabel(String)} 반환값.
     *
     * @param status 판정 상태
     * @param product status=MATCHED 일 때만 non-null
     * @param token 추출된 모델 토큰 (다의성/미매칭 오류 메시지 재사용 목적으로 보존)
     */
    private record LabelResolution(LabelMatchStatus status, Product product, String token) {
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
        return toResponse(findByModelNameOrThrow(modelName));
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
     * modelCode 리스트의 카탈로그 정보를 일괄 조회한다.
     *
     * <p>partner-order 상세 enrich 는 direct PUT 라인의 synthetic productId 와 무관하게
     * 주문 라인에 저장된 사용자 식별자(modelName/modelCode snapshot)를 기준으로 productType 을 붙인다.
     *
     * @param modelCodes 조회할 modelCode 목록
     * @return 활성 Product 요약 목록 (미매칭 modelCode 는 UUID lookup 과 동일하게 생략)
     */
    @Transactional(readOnly = true)
    public List<ProductSummaryResponse> lookupByModelCodes(List<String> modelCodes) {
        if (modelCodes == null || modelCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelCode가 비어있습니다");
        }
        if (modelCodes.size() > LOOKUP_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 " + LOOKUP_MAX + "건입니다");
        }
        List<String> normalized = modelCodes.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .collect(java.util.stream.Collectors.collectingAndThen(
                        java.util.stream.Collectors.toCollection(LinkedHashSet::new),
                        ArrayList::new));
        if (normalized.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 modelCode가 비어있습니다");
        }
        return productRepository.findByModelCodeInAndIsDeletedFalse(normalized).stream()
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
        String modelCode = req.modelName().trim();
        if (productRepository.existsByModelCodeAndIsDeletedFalse(modelCode)) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 모델코드입니다: " + modelCode);
        }
        Category category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "카테고리를 찾을 수 없습니다"));

        try {
            Product product = Product.create(
                    req.name(),
                    req.modelName(),
                    category,
                    req.sellingPrice(),
                    req.purchasePrice(),
                    req.currency(),
                    req.tags(),
                    req.description());
            product.changeModelCode(modelCode);
            applyCreateFields(product, req);
            Product saved = productRepository.save(product);
            // applyCreateFields 가 SET_COMPONENT 등 scope 를 NONE 으로 강제할 수 있으므로
            // 요청값이 아니라 영속된 effective scope 로 노출을 동기화한다 (P2 — update 경로와 정합).
            syncEstimateExposures(saved, saved.getUsageScope(), req.estimateCategories(), "product-create");
            saveSpecs(saved, req.specs());
            if (itemKind(req.itemKind()) == ProductItemKind.SET_COMPONENT) {
                bundleComponentService.addRegisteredComponent(
                        req.parentSetModelCode(),
                        saved.getModelCode(),
                        req.componentKind());
            }
            return toResponse(saved);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }

    /**
     * 제품 부분 수정.
     *
     * <p>개발책임자 결정: {@code modelCode} 는 생성 시 {@code modelName.trim()} 으로 한 번 설정한 뒤
     * 이후 수정에서 불변이다. {@code modelName} 을 바꿔도 BundleComponent 링크와 사용자 노출 식별자인
     * {@code modelCode} 는 변경하지 않는다.
     */
    public ProductResponse update(UUID id, UpdateProductRequest req) {
        quantitySyncRuleService.lockGraphMutation();
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
        // 🚨 2026-07-28 재수렴 R6 결함 1·2 [단일 근본 원인] fix (I-1) — "usageScope가
        // NONE으로 전이하는가"(값 열거)가 아니라 "쓰기 이후 실제로 남을 노출 상태가 활성
        // 규칙을 깨는가"로 판정한다. 이 계열은 5회차였다(R1 단종/삭제 → R2 optionIn →
        // R3 usageScope=NONE → R4 estimateCategories → R5 PARTNER_ORDER) — 값 하나씩
        // 막는 가드는 UsageScope의 다음 값이 뚫는다. applyUpdateFields()가 이미
        // product.changeUsage(...)를 도메인 객체에 반영했으므로 product.getUsageScope()가
        // 곧 "쓰기 이후" 값이다.
        boolean usageForcedNone = applyUpdateFields(product, req);
        if (usageForcedNone || req.usageScope() != null || req.estimateCategories() != null) {
            assertResultingStateSatisfiesQuantitySyncRules(product, product.getUsageScope(), req.estimateCategories());
            syncEstimateExposures(product, product.getUsageScope(), req.estimateCategories(), "product-update");
        }
        if (req.specs() != null) {
            replaceSpecs(product, req.specs());
        }
        return toResponse(product);
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
        return toResponse(product);
    }

    public ProductResponse replaceTags(UUID id, Map<String, String> tags) {
        Product product = loadOrThrow(id);
        product.replaceTags(tags);
        return toResponse(product);
    }

    public void discontinue(UUID id) {
        quantitySyncRuleService.lockGraphMutation();
        Product product = loadOrThrow(id);
        assertNotReferencedByEnabledQuantitySyncRule(id);
        product.discontinue();
    }

    public void reactivate(UUID id) {
        loadOrThrow(id).reactivate();
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
        quantitySyncRuleService.lockGraphMutation();
        Product product = loadByModelCodeOrThrow(modelCode);
        // 🚨 2026-07-28 재수렴 R6 결함 1 [HIGH] fix (I-1) — update()와 같은 이유로 이
        // 경로도 "NONE 전이"만 판정했다(PARTNER_ORDER 등 다른 UsageScope 값은 통과). 실제
        // 저장될 usageScope(req.usageScope(), null이면 markUsageManual()과 동일하게
        // NONE으로 취급)를 effectiveScope로 넘겨 결과 상태 전체를 판정한다.
        UsageScope effectiveScope = req.usageScope() == null ? UsageScope.NONE : req.usageScope();
        assertResultingStateSatisfiesQuantitySyncRules(product, effectiveScope, req.estimateCategories());
        product.markUsageManual(req.usageScope());
        syncEstimateExposures(product, req.usageScope(), req.estimateCategories(), "product-usage-manual");
        return product;
    }

    /**
     * 품목 변동DC 수동 override — 갱신된 {@link Product} 도메인 객체를 직접 반환한다.
     *
     * <p>초기값은 시트 sync 가 적재하지만, 멀티 카탈로그(견적품목 관리)의 수동 토글은
     * {@link Product#markVariableDiscountManual(boolean)} 로 보호하여 이후 sync 가 덮어쓰지 않는다.
     * SET 직후에는 rowHash evict 가 필요 없다. 다음 sync 가 행 무변경이면 unchanged 분기로
     * 수동값이 그대로 유지되고, 행 변경으로 update 분기에 진입해도 variableDiscountManual 가드가
     * 변동DC 및 부속 할인필드를 보호한다.
     *
     * @param modelCode 수동 override 대상 품목의 모델코드
     * @param req       새 변동DC 적용 여부
     * @return 갱신된 Product 엔티티 (트랜잭션 내 — 호출자가 DTO 변환)
     * @throws BusinessException(NOT_FOUND) modelCode 에 해당하는 품목이 없을 때
     */
    public Product updateVariableDiscountAndReturn(String modelCode, UpdateProductVariableDiscountRequest req) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.markVariableDiscountManual(req.hasVariableDiscount());
        return product;
    }

    /** 품목별 L/M/S 분류를 FE F1-b PATCH body 계약 그대로 저장한다. */
    public Product updateClassificationAndFixedDiscount(String modelCode,
                                                        UpdateProductClassificationRequest req) {
        Product product = loadByModelCodeOrThrow(modelCode);
        Classification catL = loadClassification(req.catLId(), Classification.CatLevel.L, "대분류");
        Classification catM = loadClassification(req.catMId(), Classification.CatLevel.M, "중분류");
        Classification catS = loadClassification(req.catSId(), Classification.CatLevel.S, "소분류");
        validateClassificationTree(product, catL, catM, catS);

        product.markClassificationManual(catL, catM, catS);

        String evictKey = product.getModelCode();
        if (evictKey != null) {
            productSheetSyncService.evictRowHash(evictKey);
        }
        return product;
    }

    /** 품목별 고정DC율 수동 override — null 은 전역DC율 영향 품목으로 저장한다. */
    public Product updateFixedDiscountAndReturn(String modelCode, UpdateProductFixedDiscountRequest req) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.markFixedDiscountManual(parseFixedDiscountRate(req.fixedDiscountRate()));
        String evictKey = product.getModelCode();
        if (evictKey != null) {
            productSheetSyncService.evictRowHash(evictKey);
        }
        return product;
    }

    public void clearUsageOverride(String modelCode) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.clearUsageManual();
        // evict: 로드된 엔티티의 실제 modelCode 를 키로 사용. null 이면 캐시 항목 없으므로 no-op.
        String evictKey = product.getModelCode();
        if (evictKey != null) {
            productSheetSyncService.evictRowHash(evictKey);
        }
    }

    /**
     * 품목 변동DC 수동 override 해제 — modelCode 로 품목을 조회하고
     * {@link Product#clearVariableDiscountManual()} 을 호출하여 플래그를 해제한다.
     *
     * <p>플래그 해제 후 다음 ProductSheetSyncService sync 에서 시트 기준으로 재적재된다.
     * usage override 와 동일하게 rowHash 캐시를 무효화하여 행 내용이 같아도 update 경로에 진입시킨다.
     *
     * @param modelCode override 해제 대상 품목의 카탈로그 노출 식별자 (modelCode 또는 modelName)
     * @throws BusinessException(NOT_FOUND) modelCode 에 해당하는 품목이 없을 때
     */
    public void clearVariableDiscountOverride(String modelCode) {
        Product product = loadByModelCodeOrThrow(modelCode);
        product.clearVariableDiscountManual();
        String evictKey = product.getModelCode();
        if (evictKey != null) {
            productSheetSyncService.evictRowHash(evictKey);
        }
    }

    public void delete(UUID id, String callerId) {
        quantitySyncRuleService.lockGraphMutation();
        Product product = loadOrThrow(id);
        assertNotReferencedByEnabledQuantitySyncRule(id);
        String actor = callerId == null ? "system" : callerId;
        product.markDeleted(actor);
        softDeleteAll(exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()), actor);
    }

    /**
     * R1 결함 3 [MED] · 재수렴 결함 3 [MED] — 품목 상태 변경(단종/삭제/노출구분 NONE 전환)이
     * 수량 동기화 규칙 참조 때문에 막힐 때, 그 원인이 "동시 편집 충돌 또는 제약 위반"으로
     * 위장되지 않고 사용자에게 드러나도록 실제 mutation 전에 선제 확인한다. V24 DB에는
     * 규칙 강제 trigger를 두지 않으므로 이 Java 검증이 API 쓰기 경로의 무결성 경계다.
     *
     * <p>재수렴 R1에서 discontinue()/delete()에만 있던 이 가드가 update()(PATCH 노출구분
     * 변경 포함)·updateUsageAndReturn()(수동 override)에는 없어 같은 원인인데 호출 경로별로
     * 다른 메시지가 나가는 결함이 있었다(M-5) — 메시지를 "단종/삭제"로 특정 동작에 묶지 않고
     * 상태 변경 일반으로 표현해 어느 경로로 오든 동일한 문자열을 낸다.
     *
     * @param productId 상태를 변경하려는 Product 내부 FK
     * @throws BusinessException(CONFLICT) 활성(enabled)+비삭제 규칙이 참조 중일 때
     */
    private void assertNotReferencedByEnabledQuantitySyncRule(UUID productId) {
        List<String> ruleKeys = quantitySyncRuleService.findEnabledRuleKeysReferencing(productId);
        if (!ruleKeys.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: "
                            + String.join(", ", ruleKeys));
        }
    }

    /**
     * 🚨 2026-07-28 재수렴 R6 결함 1·2 [단일 근본 원인] fix (I-1) — update()/
     * updateUsageAndReturn() 공용 통합 판정. "usageScope 값이 무엇인가"·"카테고리가
     * 요청에 있는가"를 따로 열거하지 않고, 쓰기 이후 실제로 남을 (active, visible,
     * categories) 스냅샷을 {@link #resolveResultingExposedCategories}로 계산해
     * {@link QuantitySyncRuleService#findEnabledRuleKeysBrokenByResultingState}에
     * 그대로 넘긴다 — syncEstimateExposures()가 실제로 만들 상태와 같은 계산이므로
     * "판정이 통과됐는데 실제 저장은 다르게 됐다"는 드리프트가 구조적으로 없다.
     *
     * @param product              현재 편집 중인 Product(이미 도메인 메서드로 usageScope 반영됨)
     * @param effectiveScope       쓰기 이후 유효 usageScope(null 이면 NONE 취급은 호출자 책임)
     * @param requestedCategories  요청 estimateCategories(null 이면 기존 노출 유지)
     * @throws BusinessException(CONFLICT) 활성(enabled) 규칙이 결과 상태로 깨질 때
     */
    private void assertResultingStateSatisfiesQuantitySyncRules(
            Product product, UsageScope effectiveScope, List<EstimateCategory> requestedCategories) {
        if (product.getId() == null) {
            return;
        }
        boolean resultingVisible = effectiveScope != null && effectiveScope != UsageScope.NONE;
        Set<EstimateCategory> resultingCategories =
                resolveResultingExposedCategories(product, effectiveScope, requestedCategories);
        List<String> ruleKeys = quantitySyncRuleService.findEnabledRuleKeysBrokenByResultingState(
                product.getId(), product.getStatus() == ProductStatus.ACTIVE, resultingVisible, resultingCategories);
        if (!ruleKeys.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: "
                            + String.join(", ", ruleKeys));
        }
    }

    /**
     * {@link #syncEstimateExposures}가 실제로 만들 활성 노출 카테고리 집합을 미리
     * 시뮬레이션한다(단일 원천 — 이 로직이 바뀌면 {@link #syncEstimateExposures}도 함께
     * 봐야 한다는 뜻이므로 로직 자체를 공유하지 않고 같은 3-분기 규칙만 나란히 유지한다).
     *
     * <p>🚨 재수렴 R6 결함 2 [HIGH] fix — {@code Set.copyOf(requestedCategories)}가 배열에
     * null 원소({@code [null]})가 있으면 NPE를 던져 규칙과 무관한 품목까지 전 품목 편집이
     * 500이 됐다. {@link #normalizeCategories}(null 필터링 후 Set 구성)로 교체해
     * {@code [null]}·빈 배열·중복·미지 값 어떤 배열이 와도 500 없이 의미 있는 판정으로
     * 이어지게 한다.
     */
    private Set<EstimateCategory> resolveResultingExposedCategories(
            Product product, UsageScope effectiveScope, List<EstimateCategory> requestedCategories) {
        if (!isEstimateScope(effectiveScope == null ? UsageScope.NONE : effectiveScope)) {
            return Set.of();
        }
        if (requestedCategories == null) {
            List<ProductEstimateExposure> active =
                    exposureRepository.findByProductIdAndIsDeletedFalse(product.getId());
            if (active == null || active.isEmpty()) {
                return Set.of();
            }
            return active.stream()
                    .map(ProductEstimateExposure::getEstimateCategory)
                    .collect(java.util.stream.Collectors.toSet());
        }
        return normalizeCategories(requestedCategories);
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
    private Classification loadClassification(UUID id, Classification.CatLevel expectedLevel, String label) {
        if (id == null) {
            return null;
        }
        Classification classification = classificationRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        label + " 분류를 찾을 수 없습니다"));
        if (classification.getCatLevel() != expectedLevel) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + " 분류 단계가 올바르지 않습니다");
        }
        if (!classification.isActive()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "중지된 " + label + " 분류는 품목에 지정할 수 없습니다");
        }
        return classification;
    }

    private void validateClassificationTree(Product product,
                                            Classification catL,
                                            Classification catM,
                                            Classification catS) {
        EstimateCategory category = null;
        if (catL != null) {
            category = catL.getEstimateCategory();
        }
        if (catM != null) {
            if (catL == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "중분류를 지정하려면 대분류가 필요합니다");
            }
            if (catM.getParent() == null || !catM.getParent().getId().equals(catL.getId())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "중분류의 상위 분류가 대분류와 일치하지 않습니다");
            }
            category = requireSameEstimateCategory(category, catM.getEstimateCategory());
        }
        if (catS != null) {
            if (catM == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "소분류를 지정하려면 중분류가 필요합니다");
            }
            if (catS.getParent() == null || !catS.getParent().getId().equals(catM.getId())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "소분류의 상위 분류가 중분류와 일치하지 않습니다");
            }
            category = requireSameEstimateCategory(category, catS.getEstimateCategory());
        }
        if (category != null) {
            final EstimateCategory targetCategory = category;
            boolean exposed = exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()).stream()
                    .anyMatch(exposure -> exposure.getEstimateCategory() == targetCategory);
            if (!exposed) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "품목의 견적 노출 카테고리와 분류 카테고리가 일치하지 않습니다");
            }
        }
    }

    private EstimateCategory requireSameEstimateCategory(EstimateCategory current, EstimateCategory next) {
        if (current == null) {
            return next;
        }
        if (current != next) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "분류의 견적 카테고리가 서로 다릅니다");
        }
        return current;
    }

    private BigDecimal parseFixedDiscountRate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            BigDecimal rate = new BigDecimal(raw.trim()).setScale(2, RoundingMode.HALF_UP);
            if (rate.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(new BigDecimal("100.00")) > 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "고정DC율은 0 이상 100 이하이어야 합니다");
            }
            return rate;
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "고정DC율이 숫자가 아닙니다");
        }
    }

    private Product loadByModelCodeOrThrow(String modelCode) {
        return productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(modelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "모델코드에 해당하는 품목을 찾을 수 없습니다: " + modelCode));
    }

    private ProductResponse toResponse(Product product) {
        List<ProductSpecResponse> specs = specResponses(product);
        if (product.getProductType() == ProductType.BUNDLE) {
            return ProductResponse.from(product, ProductItemKind.SET, null, null, specs);
        }
        ParentComponentLink parentLink = findParentComponentLink(product);
        if (parentLink != null) {
            return ProductResponse.from(
                    product,
                    ProductItemKind.SET_COMPONENT,
                    parentLink.parentModelCode(),
                    parentLink.componentKind(),
                    specs);
        }
        return ProductResponse.from(product, ProductItemKind.GENERAL, null, null, specs);
    }

    /** 제품 등록/수정 화면의 동적 사양을 ProductSpec 1:N row 로 저장한다. */
    private void saveSpecs(Product product, List<ProductSpecRequest> specs) {
        if (specs == null || specs.isEmpty()) {
            return;
        }
        validateDuplicateSpecKeys(specs);
        for (int i = 0; i < specs.size(); i++) {
            ProductSpecRequest spec = specs.get(i);
            try {
                productSpecRepository.save(ProductSpec.create(
                        product.getId(),
                        spec.specKey(),
                        spec.specValue(),
                        spec.unit(),
                        i + 1));
            } catch (IllegalArgumentException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
            }
        }
    }

    /**
     * 수정 요청에 specs 필드가 명시되면 기존 활성 사양을 soft-delete 하고 요청 배열로 전량 교체한다.
     * specs=null 은 기존 사양 유지, specs=[] 은 전체 삭제 의미다.
     */
    private void replaceSpecs(Product product, List<ProductSpecRequest> specs) {
        List<ProductSpec> currentSpecs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(product.getId());
        if (currentSpecs != null) {
            for (ProductSpec spec : currentSpecs) {
                spec.markDeleted("system");
            }
        }
        saveSpecs(product, specs);
    }

    private List<ProductSpecResponse> specResponses(Product product) {
        if (product.getId() == null) {
            return List.of();
        }
        List<ProductSpec> specs = productSpecRepository.findByProductIdOrderByDisplayOrderAsc(product.getId());
        if (specs == null || specs.isEmpty()) {
            return List.of();
        }
        return specs.stream()
                .map(ProductSpecResponse::from)
                .toList();
    }

    private void validateDuplicateSpecKeys(List<ProductSpecRequest> specs) {
        Set<String> keys = new HashSet<>();
        for (ProductSpecRequest spec : specs) {
            String key = spec.specKey() == null ? null : spec.specKey().trim();
            if (key == null || key.isBlank()) {
                continue;
            }
            if (!keys.add(key)) {
                throw new BusinessException(ErrorCode.CONFLICT, "이미 존재하는 specKey: " + key);
            }
        }
    }

    private ParentComponentLink findParentComponentLink(Product product) {
        String componentCode = product.getModelCode();
        if (componentCode == null || componentCode.isBlank()) {
            return null;
        }
        List<BundleComponent> links = bundleComponentRepository.findByComponentProductCode(componentCode);
        if (links == null || links.isEmpty()) {
            return null;
        }

        List<UUID> parentIds = links.stream()
                .map(BundleComponent::getBundleProductId)
                .distinct()
                .toList();
        Map<UUID, Product> parentsById = productRepository.findAllByIdIn(parentIds).stream()
                .collect(java.util.stream.Collectors.toMap(Product::getId, p -> p, (left, right) -> left));
        for (BundleComponent link : links) {
            Product parent = parentsById.get(link.getBundleProductId());
            if (parent != null && parent.getProductType() == ProductType.BUNDLE) {
                return new ParentComponentLink(
                        parent.getModelCode() != null ? parent.getModelCode() : parent.getModelName(),
                        link.getComponentKind());
            }
        }
        return null;
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

    /**
     * PostgreSQL LIKE 와일드카드 이스케이프 (사이클2 지적 P3-4, 2026-06-11).
     *
     * <p>PostgreSQL 기본 ESCAPE 문자는 백슬래시이므로
     * {@code \} → {@code \\}, {@code %} → {@code \%}, {@code _} → {@code \_} 로 변환한다.
     * 쿼리의 {@code ESCAPE '\\'} 선언과 쌍을 이룬다.
     * 검색어가 null/blank 인 경우 호출자가 null 을 바인딩하므로 이 메서드는 비어 있지 않은 경우에만 호출된다.
     *
     * @param q 원본 검색어 (trim 완료 후 전달)
     * @return LIKE 바인딩에 안전한 이스케이프된 검색어
     */
    public static String escapeLikeWildcards(String q) {
        return q.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    private void applyCreateFields(Product product, CreateProductRequest req) {
        ProductItemKind itemKind = itemKind(req.itemKind());
        if (itemKind == ProductItemKind.SET) {
            product.changeBundle(ProductType.BUNDLE,
                    req.bundleMode() == null ? BundleMode.EXPAND : req.bundleMode());
        } else {
            product.changeBundle(ProductType.SINGLE, null);
        }
        if (itemKind == ProductItemKind.SET_COMPONENT) {
            product.changeUsage(UsageScope.NONE);
        } else if (req.usageScope() != null) {
            product.changeUsage(req.usageScope());
        }
        product.changeProductCategory(req.productCategory());
        product.changeGoodsType(goodsType(req.goodsType()));
        product.changeUnit(req.unit());
        product.changePrices(req.releasePrice(), req.deliveryPrice());
        applyMaterialDefaults(product);
    }

    private boolean applyUpdateFields(Product product, UpdateProductRequest req) {
        boolean forceUsageNone = false;
        if (req.itemKind() != null) {
            boolean wasBundle = product.getProductType() == ProductType.BUNDLE;
            if (req.itemKind() == ProductItemKind.SET) {
                product.changeBundle(ProductType.BUNDLE,
                        req.bundleMode() == null ? BundleMode.EXPAND : req.bundleMode());
                bundleComponentService.removeRegisteredComponentLinks(product.getModelCode(), "system");
            } else {
                if (wasBundle) {
                    bundleComponentService.removeBundleChildren(product.getId(), "system");
                }
                product.changeBundle(ProductType.SINGLE, null);
            }
            // 구성품 링크는 세트측(BundleComponent)에서만 관리한다.
            // 단일(GENERAL) 품목 편집은 부모 세트의 구성품 링크를 변경하지 않는다.
            if (req.itemKind() == ProductItemKind.SET_COMPONENT) {
                product.changeUsage(UsageScope.NONE);
                forceUsageNone = true;
                bundleComponentService.replaceRegisteredComponentLink(
                        req.parentSetModelCode(),
                        product.getModelCode(),
                        req.componentKind(),
                        "system");
            }
        } else if (req.bundleMode() != null && product.getProductType() == ProductType.BUNDLE) {
            product.changeBundle(ProductType.BUNDLE, req.bundleMode());
        } else if (product.getProductType() != ProductType.BUNDLE
                && (req.parentSetModelCode() != null || req.componentKind() != null)) {
            ParentComponentLink currentLink = findParentComponentLink(product);
            String parentSetModelCode = req.parentSetModelCode() != null
                    ? req.parentSetModelCode()
                    : currentLink == null ? null : currentLink.parentModelCode();
            if (parentSetModelCode != null && !parentSetModelCode.isBlank()) {
                product.changeUsage(UsageScope.NONE);
                forceUsageNone = true;
                bundleComponentService.replaceRegisteredComponentLink(
                        parentSetModelCode,
                        product.getModelCode(),
                        req.componentKind() != null ? req.componentKind()
                                : currentLink == null ? null : currentLink.componentKind(),
                        "system");
            }
        }
        if (req.productCategory() != null) {
            product.changeProductCategory(req.productCategory());
        }
        if (!forceUsageNone && req.usageScope() != null) {
            product.changeUsage(req.usageScope());
        }
        if (req.goodsType() != null) {
            product.changeGoodsType(req.goodsType());
        }
        product.changeUnit(req.unit());
        product.changePrices(req.releasePrice(), req.deliveryPrice());
        applyMaterialDefaults(product);
        return forceUsageNone || product.getProductCategory() == ProductCategory.MATERIAL;
    }

    private void applyMaterialDefaults(Product product) {
        if (product.getProductCategory() != ProductCategory.MATERIAL) {
            return;
        }
        // 자재 품목은 견적/주문 라인 선택 대상이 아니며, 재고 생성 대상도 아니다.
        if (product.getProductType() == ProductType.BUNDLE) {
            bundleComponentService.removeBundleChildren(product.getId(), "system");
        }
        product.changeBundle(ProductType.SINGLE, null);
        product.changeUsage(UsageScope.NONE);
        product.changeGoodsType(ProductGoodsType.NON_GOODS);
        if (product.getUnit() == null || product.getUnit().isBlank()) {
            product.changeUnit("EA");
        }
    }

    private ProductItemKind itemKind(ProductItemKind itemKind) {
        return itemKind == null ? ProductItemKind.GENERAL : itemKind;
    }

    private ProductGoodsType goodsType(ProductGoodsType goodsType) {
        return goodsType == null ? ProductGoodsType.GOODS : goodsType;
    }

    /**
     * 품목 견적 노출 M:N 행을 요청 목록으로 맞춘다.
     *
     * <p>usageScope 가 ESTIMATE/BOTH 가 아니면 모든 활성 노출을 soft-delete 한다.
     * 활성 scope 에서는 요청 목록에 포함된 카테고리만 남기고, 새 카테고리는 해당 카테고리의
     * 현재 최대 displayOrder + 1 로 추가한다. 요청 목록이 null 이면 기존 노출을 유지한다.
     */
    private void syncEstimateExposures(Product product,
                                       UsageScope usageScope,
                                       List<EstimateCategory> requestedCategories,
                                       String actor) {
        if (product.getId() == null) {
            return;
        }
        UsageScope effectiveScope = usageScope == null ? UsageScope.NONE : usageScope;
        List<ProductEstimateExposure> active =
                exposureRepository.findByProductIdAndIsDeletedFalse(product.getId());
        if (active == null) {
            active = List.of();
        }
        if (!isEstimateScope(effectiveScope)) {
            softDeleteAll(active, actor);
            return;
        }
        if (requestedCategories == null) {
            return;
        }

        Set<EstimateCategory> requested = normalizeCategories(requestedCategories);
        Map<EstimateCategory, ProductEstimateExposure> activeByCategory = active.stream()
                .collect(java.util.stream.Collectors.toMap(
                        ProductEstimateExposure::getEstimateCategory,
                        e -> e,
                        (left, right) -> left,
                        LinkedHashMap::new));

        for (ProductEstimateExposure exposure : active) {
            if (!requested.contains(exposure.getEstimateCategory())) {
                exposure.markDeleted(actor);
            }
        }
        for (EstimateCategory category : requested) {
            if (!activeByCategory.containsKey(category)) {
                int nextOrder = exposureRepository.maxDisplayOrder(category) + 1;
                exposureRepository.save(ProductEstimateExposure.create(product.getId(), category, nextOrder));
            }
        }
    }

    private void softDeleteAll(List<ProductEstimateExposure> exposures, String actor) {
        for (ProductEstimateExposure exposure : exposures) {
            exposure.markDeleted(actor);
        }
    }

    private boolean isEstimateScope(UsageScope scope) {
        return scope == UsageScope.ESTIMATE || scope == UsageScope.BOTH;
    }

    private Set<EstimateCategory> normalizeCategories(List<EstimateCategory> categories) {
        return categories.stream()
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private record ParentComponentLink(String parentModelCode,
                                       BundleComponent.ComponentKind componentKind) {
    }
}
