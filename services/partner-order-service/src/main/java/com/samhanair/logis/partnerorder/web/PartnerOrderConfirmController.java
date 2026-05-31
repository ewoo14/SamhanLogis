package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
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
 * 주문 확정 endpoint (legacy sendOrderFromUi) — 슬라이스 D1 이후 slip 자동발행 폐지.
 *
 * <p>권한 — PARTNER + admin (MASTER/MANAGER).
 *
 * <p>본 endpoint 는 임시저장 ID (path) 를 받아 거래처 주문을 DRAFT 상태로 생성한다.
 * confirm 단계에서는 slip-service 를 호출하지 않으며 slipNo 는 항상 null 이다.
 * 출고전표 발행은 이후 본사 데스크톱의 명시적 convert 액션({@code PartnerOrderConvertService})으로만 수행한다.
 *
 * <p>응답:
 * <ul>
 *   <li>{@code status=DRAFT} — 진행중(주문 접수됨, 출고전표 미생성)</li>
 *   <li>{@code slipPublishStatus=NOT_REQUIRED} — confirm 단계에서 slip 발행 불필요</li>
 *   <li>{@code slipNo=null} — 항상 null (출고전표는 convert 후 채워짐)</li>
 * </ul>
 *
 * <p>멱등 보장 — 동일 (partnerCode, draftSeq) 로 재호출 시 기존 주문을 반환하며 중복 row 생성 없음
 * (idempotencyKey = {@code "PO-CONF-" + partnerCode + "-" + draftSeq}).
 *
 * <p>SP-D6-2 동적 권한 가드: {@code sales.partner-order.confirm} CREATE.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderConfirmController {

    private static final String USER_ID_HEADER      = "X-User-Id";
    private static final String USER_NAME_HEADER    = "X-User-Name";
    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";
    private static final String BIZ_CODE_HEADER     = "X-Biz-Code";
    private static final String ROLE_HEADER         = "X-User-Role";

    private final PartnerOrderConfirmService confirmService;

    /**
     * 임시저장 → 확정 (path variable = draftId) — 슬라이스 D1 이후 DRAFT 주문만 생성.
     *
     * <p>draftId 가 없으면 partnerCode 별 MAX draftSeq + 1 로 idempotencyKey 를 채번한다.
     * confirm 은 slip-service 를 호출하지 않으므로 응답 {@code slipNo=null},
     * {@code status=DRAFT}, {@code slipPublishStatus=NOT_REQUIRED} 가 항상 반환된다.
     * 출고전표 발행은 별도 convert API 로만 수행한다.
     *
     * @return 200, ConfirmResponse — status=DRAFT, slipNo=null, slipPublishStatus=NOT_REQUIRED
     */
    @Operation(summary = "주문 확정 (D1 — slip 자동발행 없음)",
            description = "거래처 주문을 DRAFT 상태로 생성한다. slip-service 미호출. "
                    + "출고전표는 convert API 로 명시적으로만 발행 가능.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "확정 성공 — status=DRAFT, slipNo=null"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "임시저장(draftId) 또는 product 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "멱등 충돌 (동일 주문 중복 confirm 시도)")
    })
    @PostMapping("/{draftId}/confirm")
    @RequirePermission(page = "sales.partner-order.confirm", action = PermissionAction.CREATE,
            partnerSelfService = true)
    public ApiResponse<ConfirmResponse> confirm(
            @PathVariable UUID draftId,
            @Valid @RequestBody ConfirmRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode,
            @RequestHeader(value = BIZ_CODE_HEADER, required = false) String bizCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId,
            @RequestHeader(value = USER_NAME_HEADER, required = false) String userName,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(
                confirmService.confirm(partnerCode, bizCode, fallback(userId), userName,
                        draftId, request));
    }

    private String fallback(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
