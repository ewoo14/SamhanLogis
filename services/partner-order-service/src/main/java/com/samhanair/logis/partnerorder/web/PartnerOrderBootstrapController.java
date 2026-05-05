package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.BootstrapService;
import com.samhanair.logis.partnerorder.web.dto.BootstrapResponse;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 16종 bootstrap prefetch endpoint (legacy doGet 4~23 의 16개 템플릿 변수 대체).
 * SecurityConfig 에서 익명 허용 — 로그인 전 mobile-gate 진입 시 prefetch 가능 (legacy 동작).
 */
@RestController
@RequestMapping("/api/v1/partner-orders/bootstrap")
@RequiredArgsConstructor
public class PartnerOrderBootstrapController {

    private final BootstrapService bootstrapService;

    @Operation(summary = "16종 bootstrap prefetch",
            description = "config 키는 DC 9키 제거 후 응답 (M3 가드 일관)")
    @GetMapping
    public ApiResponse<BootstrapResponse> fetch() {
        return ApiResponse.ok(bootstrapService.fetch());
    }
}
