package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderHoldService;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 보류(ON_HOLD) 전이 REST endpoint (Phase 2.5).
 *
 * <p>보류/해제 권한은 기존 {@code sales.partner-order.edit} UPDATE action 을 재사용한다.
 * 전이 규칙:
 * <ul>
 *   <li>{@code POST /{id}/hold} — DRAFT → ON_HOLD (보류). DRAFT 가 아니면 409.</li>
 *   <li>{@code POST /{id}/release} — ON_HOLD → DRAFT (보류 해제). ON_HOLD 가 아니면 409.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderHoldController {

    private final PartnerOrderHoldService holdService;

    /**
     * 주문 보류 처리 — 진행중(DRAFT) → 보류(ON_HOLD).
     *
     * <p>기존 edit 권한(UPDATE) 재사용. DRAFT 가 아닌 주문에 호출 시 409 CONFLICT.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param actorId X-User-Id 헤더 (감사용)
     * @param actorName X-User-Name 헤더 (감사용)
     * @return 전이 후 주문 상세 DTO
     */
    @Operation(summary = "거래처 주문 보류",
            description = "진행중(DRAFT) 주문을 보류(ON_HOLD) 상태로 전이합니다. 기존 edit 권한 재사용.")
    @PostMapping("/{id}/hold")
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderDetailResponse> hold(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String actorName) {
        return ApiResponse.ok(holdService.hold(id, actorId, actorName));
    }

    /**
     * 주문 보류 해제 — 보류(ON_HOLD) → 진행중(DRAFT).
     *
     * <p>기존 edit 권한(UPDATE) 재사용. ON_HOLD 가 아닌 주문에 호출 시 409 CONFLICT.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param actorId X-User-Id 헤더 (감사용)
     * @param actorName X-User-Name 헤더 (감사용)
     * @return 전이 후 주문 상세 DTO
     */
    @Operation(summary = "거래처 주문 보류 해제",
            description = "보류(ON_HOLD) 주문을 진행중(DRAFT) 상태로 되돌립니다. 기존 edit 권한 재사용.")
    @PostMapping("/{id}/release")
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderDetailResponse> release(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String actorName) {
        return ApiResponse.ok(holdService.release(id, actorId, actorName));
    }
}
