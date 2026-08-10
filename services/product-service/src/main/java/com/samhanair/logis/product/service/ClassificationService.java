package com.samhanair.logis.product.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.ClassificationResponse;
import com.samhanair.logis.product.web.dto.CreateClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateClassificationRequest;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Classification 마스터 CRUD 서비스. */
@Service
@Transactional
@RequiredArgsConstructor
public class ClassificationService {

    private final ClassificationRepository classificationRepository;
    private final ProductRepository productRepository;
    private final QuantitySyncRuleService quantitySyncRuleService;

    @Transactional(readOnly = true)
    public List<ClassificationResponse> list(EstimateCategory estimateCategory, UUID parentId) {
        if (estimateCategory == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "견적 카테고리는 필수입니다");
        }
        List<Classification> rows = parentId == null
                ? classificationRepository.findByEstimateCategoryAndParentIsNullOrderByDisplayOrderAsc(
                        estimateCategory)
                : classificationRepository.findByParent_IdOrderByDisplayOrderAsc(parentId);
        return rows.stream()
                .filter(row -> row.getEstimateCategory() == estimateCategory)
                .map(ClassificationResponse::from)
                .toList();
    }

    public ClassificationResponse create(CreateClassificationRequest request) {
        Classification parent = resolveAndValidateParent(
                request.estimateCategory(), request.catLevel(), request.parentId());
        int displayOrder = request.displayOrder() == null
                ? classificationRepository.maxDisplayOrder(
                        request.estimateCategory(), request.catLevel(), request.parentId()) + 1
                : request.displayOrder();
        Classification saved = classificationRepository.save(Classification.create(
                request.estimateCategory(),
                request.catLevel(),
                parent,
                request.name(),
                displayOrder,
                request.active() == null || request.active()));
        return ClassificationResponse.from(saved);
    }

    public ClassificationResponse update(UUID id, UpdateClassificationRequest request) {
        Classification target = load(id);
        if (request.name() != null) {
            if (target.getCatLevel() == Classification.CatLevel.L
                    && !request.name().trim().equals(target.getName())) {
                quantitySyncRuleService.lockGraphMutation();
                List<String> ruleKeys = quantitySyncRuleService
                        .findEnabledRuleKeysBrokenByClassificationName(id, request.name().trim());
                if (!ruleKeys.isEmpty()) {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: "
                                    + String.join(", ", ruleKeys));
                }
            }
            target.rename(request.name());
        }
        if (request.parentId() != null) {
            if (request.parentId().equals(id)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "자기 자신을 상위 분류로 지정할 수 없습니다");
            }
            Classification parent = resolveAndValidateParent(
                    target.getEstimateCategory(), target.getCatLevel(), request.parentId());
            target.changeParent(parent);
        }
        if (request.displayOrder() != null) {
            target.changeDisplayOrder(request.displayOrder());
        }
        if (request.active() != null) {
            target.changeActive(request.active());
        }
        return ClassificationResponse.from(target);
    }

    public void delete(UUID id, String actor) {
        Classification target = load(id);
        if (classificationRepository.existsByParent_IdAndIsDeletedFalse(id)) {
            throw new BusinessException(ErrorCode.CONFLICT, "하위 분류가 있어 삭제할 수 없습니다");
        }
        long usedCount = productRepository.countUsingClassification(id);
        if (usedCount > 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "사용 중인 분류는 삭제할 수 없습니다. 사용 품목 수: " + usedCount);
        }
        target.markDeleted(actor == null ? "system" : actor);
    }

    private Classification load(UUID id) {
        return classificationRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "분류를 찾을 수 없습니다"));
    }

    private Classification resolveAndValidateParent(EstimateCategory estimateCategory,
                                                    Classification.CatLevel catLevel,
                                                    UUID parentId) {
        if (catLevel == Classification.CatLevel.L) {
            if (parentId != null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "대분류는 상위 분류를 가질 수 없습니다");
            }
            return null;
        }
        if (parentId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "중/소분류는 상위 분류가 필수입니다");
        }
        Classification parent = load(parentId);
        if (parent.getEstimateCategory() != estimateCategory) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "상위 분류의 견적 카테고리가 다릅니다");
        }
        Classification.CatLevel requiredParent = catLevel == Classification.CatLevel.M
                ? Classification.CatLevel.L : Classification.CatLevel.M;
        if (parent.getCatLevel() != requiredParent) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "분류 계층이 올바르지 않습니다");
        }
        return parent;
    }
}
