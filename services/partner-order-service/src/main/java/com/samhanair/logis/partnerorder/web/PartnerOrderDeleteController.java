package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partnerorder.service.PartnerOrderDeleteService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 soft delete endpoint.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderDeleteController {

    private final PartnerOrderDeleteService deleteService;

    /**
     * DRAFT/CONFIRMING 주문 soft delete. CONFIRMED 이후 주문은 삭제할 수 없다.
     */
    @Operation(summary = "거래처 주문 삭제",
            description = "본사 SALES/MANAGER/MASTER 가 주문과 라인을 soft-delete 처리합니다.")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.DELETE)
    public void delete(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        deleteService.delete(id, parseActorId(callerId), resolveName(callerId, callerName));
    }

    /**
     * 목록에서 soft-delete 된 주문을 인라인 복원한다.
     */
    @Operation(summary = "거래처 주문 삭제 복원",
            description = "soft-delete 된 주문과 같은 삭제 작업에서 제거된 라인을 다시 활성화합니다.")
    @PostMapping("/{id}/restore")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.RESTORE)
    public ApiResponse<PartnerOrderDetailResponse> restore(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(deleteService.restoreDeleted(id, parseActorId(callerId), resolveName(callerId, callerName)));
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
