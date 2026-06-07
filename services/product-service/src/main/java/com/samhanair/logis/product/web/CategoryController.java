package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.service.CategoryService;
import com.samhanair.logis.product.web.dto.CategoryResponse;
import com.samhanair.logis.product.web.dto.CreateCategoryRequest;
import com.samhanair.logis.product.web.dto.UpdateCategoryRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 카테고리 트리 CRUD.
 *
 * <p>트리 조회는 {@code products.list} VIEW, mutation 은 {@code products.admin}
 * CREATE/UPDATE/DELETE 권한을 {@code @RequirePermission} AOP 로 검증한다.
 */
@RestController
@RequestMapping("/products/categories")
@RequiredArgsConstructor
public class CategoryController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final CategoryService categoryService;

    @GetMapping
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public ApiResponse<List<CategoryResponse>> tree() {
        return ApiResponse.ok(categoryService.getTree());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public ApiResponse<CategoryResponse> create(@Valid @RequestBody CreateCategoryRequest request) {
        return ApiResponse.ok(categoryService.create(request));
    }

    @PatchMapping("/{id}")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ApiResponse<CategoryResponse> update(@PathVariable UUID id,
                                                @Valid @RequestBody UpdateCategoryRequest request) {
        return ApiResponse.ok(categoryService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.DELETE)
    public void delete(@PathVariable UUID id,
                       @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        categoryService.delete(id, callerHeader);
    }
}
