package com.samhanair.logis.product.web;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.service.ClassificationService;
import com.samhanair.logis.product.web.dto.ClassificationResponse;
import com.samhanair.logis.product.web.dto.CreateClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateClassificationFixedDiscountRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** F1-a 견적 품목 분류 마스터 API. */
@RestController
@RequestMapping("/api/v1/classifications")
@RequiredArgsConstructor
public class ClassificationController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final ClassificationService classificationService;

    @GetMapping
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public List<ClassificationResponse> list(
            @RequestParam EstimateCategory estimateCategory,
            @RequestParam(required = false) UUID parentId) {
        return classificationService.list(estimateCategory, parentId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public ClassificationResponse create(@Valid @RequestBody CreateClassificationRequest request) {
        return classificationService.create(request);
    }

    @PatchMapping("/{id}")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ClassificationResponse update(@PathVariable UUID id,
                                         @Valid @RequestBody UpdateClassificationRequest request) {
        return classificationService.update(id, request);
    }

    @PatchMapping("/{id}/fixed-discount")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ClassificationResponse updateFixedDiscount(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateClassificationFixedDiscountRequest request) {
        return classificationService.updateFixedDiscount(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.DELETE)
    public void delete(@PathVariable UUID id,
                       @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        classificationService.delete(id, callerHeader);
    }
}
