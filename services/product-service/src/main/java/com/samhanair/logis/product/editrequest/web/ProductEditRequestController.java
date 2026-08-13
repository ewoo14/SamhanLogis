package com.samhanair.logis.product.editrequest.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.product.editrequest.service.ProductEditRequestService;
import com.samhanair.logis.product.editrequest.web.dto.ApproveRequest;
import com.samhanair.logis.product.editrequest.web.dto.CreateEditRequestRequest;
import com.samhanair.logis.product.editrequest.web.dto.ProductEditRequestResponse;
import com.samhanair.logis.product.editrequest.web.dto.RejectRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 마스터 수정/삭제 요청 워크플로우 REST endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code POST /products/{id}/edit-request {type, reason}} — 요청 생성</li>
 *   <li>{@code POST /products/{id}/edit-request/{requestId}/approve {note?}} — 수락</li>
 *   <li>{@code POST /products/{id}/edit-request/{requestId}/reject {reason}} — 거절</li>
 *   <li>{@code GET  /products/edit-requests?targetRole=MANAGER} — 권한자 대시보드</li>
 *   <li>{@code GET  /products/{id}/edit-requests} — 제품별 요청 이력</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>요청 생성 — SALES, ACCOUNTANT, MANAGER, MASTER (작성자/회계 위임)</li>
 *   <li>수락/거절 — MANAGER, MASTER (제품 마스터 admin 결정 권한)</li>
 *   <li>대시보드 조회 — MANAGER, MASTER</li>
 * </ul>
 */
@RestController
@RequestMapping("/products")
@RequiredArgsConstructor
public class ProductEditRequestController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final ProductEditRequestService editRequestService;

    @Operation(summary = "제품 수정/삭제 요청 생성",
            description = "PR-H4b — DISCONTINUED 제품의 mutation 잠금 해제 요청")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "ACTIVE 단계 (admin 직접 가능)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "제품 미존재")
    })
    @PostMapping("/{productId}/edit-request")
    @RequirePermission(page = "products.edit-requests", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ProductEditRequestResponse>> createRequest(
            @PathVariable UUID productId,
            @Valid @RequestBody CreateEditRequestRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID requesterId = parseActorId(callerId);
        String requesterName = resolveName(callerId, callerName);
        ProductEditRequest saved = editRequestService.request(productId, request.type(),
                request.reason(), requesterId, requesterName);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ProductEditRequestResponse.from(saved)));
    }

    @Operation(summary = "수정/삭제 요청 수락",
            description = "PR-H4b — MANAGER 수락 시 작성자가 1회 mutation 가능 + SSE broadcast")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수락 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{productId}/edit-request/{requestId}/approve")
    @RequirePermission(page = "products.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<ProductEditRequestResponse> approveRequest(
            @PathVariable UUID productId,
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) ApproveRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        String note = body == null ? null : body.note();
        ProductEditRequest updated = editRequestService.approve(requestId, approverId,
                approverName, note);
        return ApiResponse.ok(ProductEditRequestResponse.from(updated));
    }

    @Operation(summary = "수정/삭제 요청 거절",
            description = "PR-H4b — MANAGER 거절 시 SSE broadcast. 거절 사유 필수")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "거절 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "거절 사유 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{productId}/edit-request/{requestId}/reject")
    @RequirePermission(page = "products.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<ProductEditRequestResponse> rejectRequest(
            @PathVariable UUID productId,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        ProductEditRequest updated = editRequestService.reject(requestId, approverId,
                approverName, body.reason());
        return ApiResponse.ok(ProductEditRequestResponse.from(updated));
    }

    @Operation(summary = "권한자 대시보드 — PENDING 요청 목록",
            description = "PR-H4b — MANAGER 그룹의 PENDING 요청 (대시보드)")
    @GetMapping("/edit-requests")
    @RequirePermission(page = "products.edit-requests.decide", action = PermissionAction.VIEW)
    public ApiResponse<List<ProductEditRequestResponse>> listForRole(
            @RequestParam EditTargetRole targetRole) {
        List<ProductEditRequest> rows = editRequestService.listPendingForRole(targetRole);
        return ApiResponse.ok(rows.stream().map(ProductEditRequestResponse::from).toList());
    }

    @Operation(summary = "제품별 요청 이력",
            description = "PR-H4b — 제품 화면의 '수정 요청 이력' 섹션. status filter 선택")
    @GetMapping("/{productId}/edit-requests")
    @RequirePermission(page = "products.edit-requests", action = PermissionAction.VIEW)
    public ApiResponse<List<ProductEditRequestResponse>> listByProduct(
            @PathVariable UUID productId,
            @RequestParam(required = false) EditRequestStatus status) {
        List<ProductEditRequest> rows = editRequestService.listByProduct(productId, status);
        return ApiResponse.ok(rows.stream().map(ProductEditRequestResponse::from).toList());
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveName(String callerId, String callerName) {
        return ActorDisplayName.resolve(callerId, callerName);
    }
}
