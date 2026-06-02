package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
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

    @Transactional(readOnly = true)
    public Page<ProductSummaryResponse> search(UUID categoryId,
                                               ProductStatus status,
                                               String tagKey,
                                               String tagValue,
                                               String q,
                                               Pageable pageable) {
        String tagFilter = buildTagFilter(tagKey, tagValue);
        String statusName = status == null ? null : status.name();
        String qNormalised = (q == null || q.isBlank()) ? null : q.trim();
        return productRepository
                .search(categoryId, statusName, qNormalised, tagFilter, pageable)
                .map(ProductSummaryResponse::from);
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

    public void delete(UUID id, String callerId) {
        Product product = loadOrThrow(id);
        product.markDeleted(callerId == null ? "system" : callerId);
    }

    private Product loadOrThrow(UUID id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "제품을 찾을 수 없습니다"));
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
