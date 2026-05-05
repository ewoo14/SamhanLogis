package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.repository.GateImageRepository;
import com.samhanair.logis.partnerorder.web.dto.GateImageResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게이트 이미지 endpoint (legacy getGateImages 7244). SecurityConfig 에서 익명 허용 —
 * mobile-gate 진입 직전 prefetch.
 */
@RestController
@RequestMapping("/api/v1/partner-orders/gate-images")
@RequiredArgsConstructor
public class GateImageController {

    private final GateImageRepository gateImageRepository;

    @Operation(summary = "게이트 이미지 조회", description = "displayOrder ASC 전체. s3Key 또는 base64 inline")
    @GetMapping
    public ApiResponse<List<GateImageResponse>> list() {
        List<GateImageResponse> result = gateImageRepository.findAllByOrderByDisplayOrderAsc().stream()
                .map(GateImageResponse::from)
                .toList();
        return ApiResponse.ok(result);
    }
}
