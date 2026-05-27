package com.samhanair.logis.product.audit.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.audit.service.ProductAuditLogService;
import com.samhanair.logis.product.audit.web.dto.ProductAuditLogResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 audit overlay REST endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /products/{productId}/audit-logs} — audit timeline (최신 revision 우선)</li>
 * </ul>
 *
 * <p>권한 — 모든 인증 사용자 (제품 화면 표시).
 */
@RestController
@RequestMapping("/products/{productId}")
@RequiredArgsConstructor
public class ProductAuditLogController {

    private final ProductAuditLogService auditLogService;

    @Operation(summary = "제품 audit timeline",
            description = "PR-H4b — 제품 마스터 수정 이력 (최신 revision 우선). soft-deleted 자동 제외")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
    })
    @GetMapping("/audit-logs")
    @RequirePermission(page = "products.list.view", action = "VIEW")
    public ApiResponse<List<ProductAuditLogResponse>> listAuditLogs(
            @PathVariable UUID productId) {
        List<ProductAuditLogResponse> items = auditLogService.listByProduct(productId).stream()
                .map(ProductAuditLogResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }
}
