package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partnerorder.service.PartnerOrderUpdateService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderUpdateRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 direct PUT 수정 endpoint.
 *
 * <p>본사 SALES/MANAGER/MASTER 즉시 수정 전용이며, PARTNER 의 수정 요청은 기존
 * {@link com.samhanair.logis.partnerorder.editrequest.web.PartnerOrderEditRequestController}
 * flow 와 공존한다.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderEditController {

    private final PartnerOrderUpdateService updateService;

    /**
     * 주문 헤더/라인 즉시 수정.
     */
    @Operation(summary = "거래처 주문 즉시 수정",
            description = "본사 SALES/MANAGER/MASTER 가 주문 헤더와 라인을 낙관적 잠금으로 수정합니다.")
    @PutMapping("/{id}")
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderDetailResponse> update(
            @PathVariable String id,
            @Valid @RequestBody PartnerOrderUpdateRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(updateService.update(id, request, parseActorId(callerId),
                resolveName(callerId, callerName)));
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
