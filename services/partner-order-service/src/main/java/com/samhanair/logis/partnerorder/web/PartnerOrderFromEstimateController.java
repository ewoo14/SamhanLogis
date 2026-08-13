package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partnerorder.service.PartnerOrderFromEstimateService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 견적 -> 거래처 주문 변환 endpoint.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderFromEstimateController {

    private final PartnerOrderFromEstimateService fromEstimateService;

    /**
     * 외부 estimate-service UUID 를 주문으로 변환한다.
     */
    @Operation(summary = "견적에서 거래처 주문 생성",
            description = "견적 snapshot 을 partner-order-service 주문 row 로 변환합니다.")
    @PostMapping("/from-estimate/{estimateId}")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.CREATE)
    public ApiResponse<PartnerOrderDetailResponse> createFromEstimate(
            @PathVariable UUID estimateId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(fromEstimateService.createFromEstimate(
                estimateId, parseActorId(callerId), resolveName(callerId, callerName)));
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
