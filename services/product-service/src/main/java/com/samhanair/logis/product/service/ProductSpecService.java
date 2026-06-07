package com.samhanair.logis.product.service;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.SpecKeyTemplate;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ProductSpec CRUD + reorder + apply-to-existing 서비스.
 *
 * <p><b>출처</b>:
 * <ul>
 *     <li>Migration Plan §2.1.7 — 7 카탈로그 endpoint (spec CRUD 5 + reorder 1 + spec-key-template 1)</li>
 *     <li>DOMAIN-EXTENSIONS §4 — 동적 스펙 1:N + SpecKeyTemplate</li>
 *     <li>G18 — 동일 specKey 중복 시 409 strict + Frontend 가드</li>
 *     <li>G19 — apply-to-existing 운영 admin trigger only + dry-run mode</li>
 * </ul>
 */
@Service
public class ProductSpecService {

    private final ProductRepository productRepository;
    private final ProductSpecRepository specRepository;
    private final SpecKeyTemplateRepository templateRepository;

    public ProductSpecService(ProductRepository productRepository,
                              ProductSpecRepository specRepository,
                              SpecKeyTemplateRepository templateRepository) {
        this.productRepository = productRepository;
        this.specRepository = specRepository;
        this.templateRepository = templateRepository;
    }

    /**
     * GET /api/v1/products/{code}/specs — displayOrder 정렬.
     *
     * <p>{@code code} 는 카탈로그 응답의 사용자 노출 식별자다. 이카운트 원천에서는
     * 품목코드({@code model_code})와 품목명/모델명({@code model_name})이 별도이며,
     * {@code model_code} 가 비어 있으면 응답 {@code modelCode} 가 {@code model_name}
     * 으로 fallback 된다. spec mutation 도 같은 fallback 조회로 왕복 정합을 유지한다.
     */
    @Transactional(readOnly = true)
    public List<ProductSpec> listByModelCode(String modelCode) {
        Product p = findProductOrThrow(modelCode);
        return specRepository.findByProductIdOrderByDisplayOrderAsc(p.getId());
    }

    /**
     * POST /api/v1/products/{code}/specs — 추가. specKey unique 중복 시 IllegalStateException
     * (controller 에서 409 변환).
     */
    @Transactional
    public ProductSpec addSpec(String modelCode, String specKey, String specValue,
                               String unit, Integer displayOrder) {
        Product p = findProductOrThrow(modelCode);
        if (specRepository.existsByProductIdAndSpecKey(p.getId(), specKey)) {
            throw new IllegalStateException("이미 존재하는 specKey: " + specKey);
        }
        int order = displayOrder == null ? nextDisplayOrder(p.getId()) : displayOrder;
        return specRepository.save(ProductSpec.create(p.getId(), specKey, specValue, unit, order));
    }

    /** PATCH /api/v1/products/{code}/specs/{id}. */
    @Transactional
    public ProductSpec editSpec(String modelCode, UUID specId, String specValue, String unit) {
        Product p = findProductOrThrow(modelCode);
        ProductSpec spec = specRepository.findById(specId)
                .orElseThrow(() -> new EntityNotFoundException("ProductSpec 없음: " + specId));
        if (!spec.getProductId().equals(p.getId())) {
            throw new IllegalStateException("해당 product 의 spec 이 아님");
        }
        spec.editValue(specValue, unit);
        return spec;
    }

    /** DELETE /api/v1/products/{code}/specs/{id} — Soft Delete. */
    @Transactional
    public void deleteSpec(String modelCode, UUID specId, String userId) {
        Product p = findProductOrThrow(modelCode);
        ProductSpec spec = specRepository.findById(specId)
                .orElseThrow(() -> new EntityNotFoundException("ProductSpec 없음: " + specId));
        if (!spec.getProductId().equals(p.getId())) {
            throw new IllegalStateException("해당 product 의 spec 이 아님");
        }
        spec.markDeleted(userId == null ? "system" : userId);
    }

    /**
     * PATCH /api/v1/products/{code}/specs/reorder — drag&drop bulk 재정렬.
     *
     * @param orderMap key=specId, value=displayOrder
     */
    @Transactional
    public void reorder(String modelCode, Map<UUID, Integer> orderMap) {
        Product p = findProductOrThrow(modelCode);
        List<ProductSpec> specs = specRepository.findByProductIdOrderByDisplayOrderAsc(p.getId());
        for (ProductSpec s : specs) {
            Integer newOrder = orderMap.get(s.getId());
            if (newOrder != null) {
                s.changeDisplayOrder(newOrder);
            }
        }
    }

    /**
     * POST /api/v1/spec-key-templates/{id}/apply-to-existing — G19.
     * dry-run mode 면 INSERT 안 하고 결과 미리보기 (CSV 형태).
     *
     * @return 추가될 (modelCode, specKey, defaultUnit) 미리보기 + 실제 변경된 수
     */
    @Transactional
    public ApplyToExistingResult applyTemplateToExisting(UUID templateId, boolean dryRun) {
        SpecKeyTemplate tmpl = templateRepository.findById(templateId)
                .orElseThrow(() -> new EntityNotFoundException("SpecKeyTemplate 없음: " + templateId));
        EstimateCategory category = tmpl.getEstimateCategory();
        // 같은 category 의 모든 product 를 대상으로 specKey 가 없는 row 만 신규 추가
        // (간소화: usage_scope 가 NONE 이 아닌 product 만)
        List<Product> candidates = productRepository.findByUsageScopeAndIsDeletedFalse(
                com.samhanair.logis.product.domain.UsageScope.BOTH);
        List<String> previewModelCodes = new ArrayList<>();
        int actuallyAdded = 0;
        for (Product p : candidates) {
            if (p.getEstimateCategory() != category) continue;
            if (specRepository.existsByProductIdAndSpecKey(p.getId(), tmpl.getSpecKey())) continue;
            previewModelCodes.add(p.getModelCode() == null ? p.getModelName() : p.getModelCode());
            if (!dryRun) {
                int order = nextDisplayOrder(p.getId());
                specRepository.save(ProductSpec.create(p.getId(), tmpl.getSpecKey(),
                        "", tmpl.getDefaultUnit(), order));
                actuallyAdded++;
            }
        }
        return new ApplyToExistingResult(tmpl.getSpecKey(), category, previewModelCodes, actuallyAdded, dryRun);
    }

    private Product findProductOrThrow(String modelCode) {
        return productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(modelCode)
                .orElseThrow(() -> new EntityNotFoundException("ProductMaster 없음 (modelCode=" + modelCode + ")"));
    }

    private int nextDisplayOrder(UUID productId) {
        return specRepository.findByProductIdOrderByDisplayOrderAsc(productId).stream()
                .map(ProductSpec::getDisplayOrder)
                .max(Integer::compareTo)
                .orElse(0) + 1;
    }

    /**
     * apply-to-existing 결과 — dry-run 시 previewModelCodes 만, 실 INSERT 시 actuallyAdded 채움.
     */
    public record ApplyToExistingResult(String specKey, EstimateCategory estimateCategory,
                                        List<String> previewModelCodes, int actuallyAdded, boolean dryRun) {
        public static ApplyToExistingResult empty() {
            return new ApplyToExistingResult(null, null, List.of(), 0, true);
        }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new HashMap<>();
            m.put("specKey", specKey);
            m.put("estimateCategory", estimateCategory == null ? null : estimateCategory.name());
            m.put("previewModelCodes", previewModelCodes);
            m.put("actuallyAdded", actuallyAdded);
            m.put("dryRun", dryRun);
            return m;
        }
    }
}
