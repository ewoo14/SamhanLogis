package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderPriceCalculationService;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.PricePreviewResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 거래처 주문 입력 중 서버 권위 가격을 조회하는 사용자용 미리보기 API. */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderPricePreviewController {

    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    private final PartnerOrderPriceCalculationService priceCalculationService;

    /**
     * 입력 중 가격 미리보기. 주문 확정과 동일한 계산 서비스를 호출한다.
     *
     * <p>권한은 임시저장 생성과 같은 {@code sales.partner-order.draft CREATE}로 통일한다.
     * PARTNER self-service guard가 거래처 코드를 JWT/헤더 거래처와 대조하므로 임의 거래처
     * 조회를 허용하지 않는다.
     */
    @Operation(summary = "주문 가격 미리보기",
            description = "서버 계산기가 적용한 최종 단가와 할인율을 반환한다. 실패 시 자체 계산 없이 503을 반환한다.")
    @PostMapping("/price-preview")
    @RequirePermission(page = "sales.partner-order.draft", action = PermissionAction.CREATE,
            partnerSelfService = true)
    public ApiResponse<PricePreviewResponse> preview(
            @Valid @RequestBody ConfirmRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        PartnerOrderPriceCalculationService.Calculation calculation =
                priceCalculationService.calculate(partnerCode, request);
        if (!calculation.available()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "가격 미리보기 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.");
        }
        return ApiResponse.ok(PricePreviewResponse.from(calculation));
    }
}
