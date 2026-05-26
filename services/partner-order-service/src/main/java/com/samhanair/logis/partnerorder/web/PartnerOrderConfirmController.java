package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;



/**
 * 주문 확정 endpoint (legacy sendOrderFromUi). 설계서 §3.6 흐름 — Sync REST + outbox + Circuit Breaker.
 *
 * <p>권한 — PARTNER + admin (MASTER/MANAGER).
 *
 * <p>본 endpoint 는 임시저장 ID (path) 를 받아 → DC + reserve + slip 발행. slipNo 는 응답에서
 * PUBLISHED 시 채워지고 PENDING_RETRY 시 null (FE 는 polling 또는 history 조회로 확인).
 *
 * <p>SP-D6-2 동적 권한 가드: {@code sales.partner-order.confirm} EDIT.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderConfirmController {

    private static final String USER_ID_HEADER      = "X-User-Id";
    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";
    private static final String BIZ_CODE_HEADER     = "X-Biz-Code";
    private static final String ROLE_HEADER         = "X-User-Role";

    private final PartnerOrderConfirmService confirmService;

    /**
     * 임시저장 → 확정 (path variable = draftId). draftId 없이 confirm 도 향후 슬라이스에서 가능
     * (skeleton 은 draft 기반 단일 흐름).
     *
     * @return 200, ConfirmResponse — slipNo 또는 PENDING_RETRY 상태
     */
    @Operation(summary = "주문 확정",
            description = "Sync REST + outbox 흐름 — slip 발행 200/409 → CONFIRMED, 5xx → PENDING_RETRY")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "확정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "draft 또는 product 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "재고 부족 또는 중복 confirm")
    })
    @PostMapping("/{draftId}/confirm")
    @RequirePermission(page = "sales.partner-order.confirm", action = "EDIT")
    public ApiResponse<ConfirmResponse> confirm(
            @PathVariable UUID draftId,
            @Valid @RequestBody ConfirmRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode,
            @RequestHeader(value = BIZ_CODE_HEADER, required = false) String bizCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(
                confirmService.confirm(partnerCode, bizCode, fallback(userId), draftId, request));
    }

    private String fallback(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
