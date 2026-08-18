package com.samhanair.logis.product.service;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleComponentEstimateSetting;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.repository.BundleComponentEstimateSettingRepository;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.BundleComponentEstimateSettingRequest;
import com.samhanair.logis.product.web.dto.BundleComponentEstimateSettingResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** 견적 카테고리별 구성품 설정 CRUD. bundle_component의 구성·가격 정본은 변경하지 않는다. */
@Service
@RequiredArgsConstructor
public class BundleComponentEstimateSettingService {
    private final ProductRepository productRepository;
    private final BundleComponentRepository componentRepository;
    private final BundleComponentEstimateSettingRepository settingRepository;

    @Transactional(readOnly = true)
    public List<BundleComponentEstimateSettingResponse> list(String modelCode,
                                                              EstimateCategory category) {
        var product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "품목을 찾을 수 없습니다."));
        return componentRepository.findByBundleProductId(product.getId()).stream()
                .map(component -> settingRepository
                        .findByBundleComponentIdAndEstimateCategoryAndIsDeletedFalse(component.getId(), category)
                        .map(setting -> BundleComponentEstimateSettingResponse.from(setting, component.getComponentProductCode()))
                        .orElseGet(() -> fallback(component, category)))
                .toList();
    }

    private BundleComponentEstimateSettingResponse fallback(BundleComponent component,
                                                             EstimateCategory category) {
        return new BundleComponentEstimateSettingResponse(component.getComponentProductCode(), category,
                component.getQtyMode(), component.getComponentKind(), component.getComponentVariant(),
                component.getComponentShape(), Boolean.TRUE.equals(component.getIsDefault()),
                component.getDisplayOrder(), false);
    }

    @Transactional
    public List<BundleComponentEstimateSettingResponse> replace(String modelCode,
                                                                 EstimateCategory category,
                                                                 List<BundleComponentEstimateSettingRequest> requests) {
        var product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "품목을 찾을 수 없습니다."));
        var components = componentRepository.findByBundleProductId(product.getId());
        var byCode = components.stream().collect(java.util.stream.Collectors.toMap(
                BundleComponent::getComponentProductCode, c -> c, (left, right) -> left));
        for (var request : requests) {
            var component = byCode.get(request.componentProductCode().trim());
            if (component == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "구성품 추가·삭제는 기초품목에서만 합니다.");
            }
            var setting = settingRepository
                    .findByBundleComponentIdAndEstimateCategoryAndIsDeletedFalse(component.getId(), category)
                    .orElseGet(() -> BundleComponentEstimateSetting.create(component.getId(), category,
                            component.getQtyMode(), component.getComponentKind(), component.getComponentVariant(),
                            component.getComponentShape(), Boolean.TRUE.equals(component.getIsDefault()), component.getDisplayOrder()));
            setting.change(request.qtyMode() == null ? setting.getQtyMode() : request.qtyMode(),
                    request.componentKind() == null ? setting.getComponentKind() : request.componentKind(),
                    request.componentVariant(), request.componentShape(), Boolean.TRUE.equals(request.isDefault()));
            settingRepository.save(setting);
        }
        return list(modelCode, category);
    }
}
