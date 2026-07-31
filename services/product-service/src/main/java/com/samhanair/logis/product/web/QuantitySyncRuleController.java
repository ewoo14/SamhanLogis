package com.samhanair.logis.product.web;

import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 수량 동기화 규칙 CRUD API.
 *
 * <p>읽기 응답은 ruleKey·modelCode·품목명만 사용자에게 반환한다. evaluator 연결과 UI chip은 후속 slice다.
 */
@RestController
@RequestMapping("/api/v1/quantity-sync-rules")
public class QuantitySyncRuleController {

    private final QuantitySyncRuleService service;

    public QuantitySyncRuleController(QuantitySyncRuleService service) {
        this.service = service;
    }

    /** 관리자 범위에서 활성 규칙 목록을 조회한다. */
    @GetMapping
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public List<QuantitySyncRuleResponse> list(
            @RequestParam(required = false) QuantitySyncEstimateCategory estimateCategory) {
        return service.list(estimateCategory);
    }

    /** 안정 ruleKey로 규칙을 조회한다. */
    @GetMapping("/{ruleKey}")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public QuantitySyncRuleResponse get(@PathVariable @NotBlank String ruleKey) {
        return service.get(ruleKey);
    }

    /** 새 규칙을 저장한다. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public QuantitySyncRuleResponse create(@Valid @RequestBody QuantitySyncRuleRequest request,
                                           @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return service.create(request, actor);
    }

    /** ruleKey에 해당하는 정의와 source/target 전체를 교체한다. */
    @PutMapping("/{ruleKey}")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public QuantitySyncRuleResponse replace(@PathVariable @NotBlank String ruleKey,
                                            @Valid @RequestBody QuantitySyncRuleRequest request,
                                            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        return service.replace(ruleKey, request, actor);
    }

    /** 규칙과 자식 관계를 soft-delete한다. */
    @DeleteMapping("/{ruleKey}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.DELETE)
    public void delete(@PathVariable @NotBlank String ruleKey,
                       @RequestHeader(value = "X-User-Id", required = false) String actor) {
        service.delete(ruleKey, actor);
    }
}
