package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderConvertService;
import com.samhanair.logis.partnerorder.service.PartnerOrderMergeConvertService;
import com.samhanair.logis.partnerorder.web.dto.ConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.ConvertToSlipRequest;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertToSlipRequest;
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
 * 거래처 주문 → 출고전표 부분전환 + 다중 병합 전환 REST endpoint.
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>{@code POST /api/v1/partner-orders/{id}/convert-to-slip} — 단일 주문 부분전환 (Phase 2.6a)</li>
 *   <li>{@code POST /api/v1/partner-orders/convert-to-slip-merge} — 다중 주문 병합 전환 (Phase 2.6b D2)</li>
 * </ul>
 *
 * <p>권한: 양 엔드포인트 모두 {@code sales.partner-order.convert} CREATE 재사용 (D-MRG-05).
 * MASTER 는 DynamicPermissionClient bypass 로 항상 허용.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderConvertController {

    private final PartnerOrderConvertService convertService;
    private final PartnerOrderMergeConvertService mergeConvertService;

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

    /**
     * 다중 주문 병합 전환 — 같은 거래처의 여러 주문 선택 라인을 단일 출고전표로 병합 발행한다 (Phase 2.6b D2).
     *
     * <p>모든 주문이 같은 거래처(partnerCode) 여야 하며, 거래처 불일치 시 409 CONFLICT.
     * 한 라인이라도 가용 재고 부족 시 전체 취소(all-or-nothing).
     *
     * @param request   병합 전환 요청 (주문×라인 목록 + 창고코드 + 병합 헤더)
     * @param actorId   X-User-Id 헤더 (감사용, null 허용)
     * @param actorName X-User-Name 헤더 (감사용, null 허용)
     * @return 전환 결과 (slipNo + 주문별 status + fullyConverted)
     */
    @Operation(summary = "다중 주문 병합 전환",
            description = "같은 거래처의 여러 주문 선택 라인을 단일 출고전표로 병합 발행합니다 (Phase 2.6b D2). "
                    + "한 라인이라도 가용 재고 부족 시 전체 취소(all-or-nothing). "
                    + "전량 전환된 주문은 각각 status 가 CONVERTED 로 변경됩니다.")
    @PostMapping("/convert-to-slip-merge")
    @RequirePermission(page = "sales.partner-order.convert", action = PermissionAction.CREATE)
    public ApiResponse<MergeConvertResultResponse> convertMerge(
            @RequestBody @Valid MergeConvertToSlipRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String actorId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String actorName) {
        return ApiResponse.ok(mergeConvertService.convertMerge(request, parseUuid(actorId), actorName));
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
