package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderConvertService;
import com.samhanair.logis.partnerorder.web.dto.ConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.ConvertToSlipRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
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
 * 거래처 주문 → 출고전표 부분전환 REST endpoint — Phase 2.6a.
 *
 * <p>endpoint: {@code POST /api/v1/partner-orders/{id}/convert-to-slip}
 *
 * <p>slip 미발행 주문(slipNo=null)의 선택 라인을 출고전표로 전환한다. 라인별 전환 수량을 지정하며,
 * 전량 전환 시 주문 status 가 CONVERTED 로 변경된다.
 *
 * <p>권한: {@code sales.partner-order.convert} CREATE — 출고전표 생성 행위이므로 별도 page 코드 사용.
 * MASTER 는 DynamicPermissionClient bypass 로 항상 허용.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderConvertController {

    private final PartnerOrderConvertService convertService;

    /**
     * 주문 부분전환 — 선택 라인의 전환 수량으로 출고전표를 발행한다.
     *
     * <p>slipNo 가 이미 있는 주문(CONFIRMED 등) 이나 CANCELED/CONFIRMING 상태는 409 CONFLICT.
     * 선택 라인의 잔여 수량을 초과하는 전환 수량도 409 CONFLICT.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param request 부분전환 요청 (선택 라인 목록 + 창고코드)
     * @param actorId X-User-Id 헤더 (감사용)
     * @param actorName X-User-Name 헤더 (감사용)
     * @return 전환 결과 (slipNo + 주문 status + fullyConverted)
     */
    @Operation(summary = "거래처 주문 부분전환",
            description = "slip 미발행 주문의 선택 라인을 출고전표로 전환합니다 (Phase 2.6a). "
                    + "전량 전환 시 주문 status 가 CONVERTED 로 변경됩니다.")
    @PostMapping("/{id}/convert-to-slip")
    @RequirePermission(page = "sales.partner-order.convert", action = PermissionAction.CREATE)
    public ApiResponse<ConvertResultResponse> convert(
            @PathVariable String id,
            @RequestBody @Valid ConvertToSlipRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String actorName) {
        UUID actorUuid = parseUuid(actorId);
        return ApiResponse.ok(convertService.convert(id, request, actorUuid, actorName));
    }

    private UUID parseUuid(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
