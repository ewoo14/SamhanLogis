package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.service.SafetyStockService;
import com.samhanair.logis.inventory.web.dto.SafetyStockAlertResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockConfigResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockSetRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 안전재고 알림 관련 엔드포인트 (P1-3).
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>알림 목록 조회 (GET /alerts/safety-stock) — MASTER/MANAGER/INVENTORY</li>
 *   <li>임계값 설정 (POST /products/{productId}/safety-stock) — MASTER/MANAGER/INVENTORY</li>
 * </ul>
 *
 * <p>UUID 사용자 비공개 가드 — 본 화면은 관리자(MASTER/MANAGER/INVENTORY) 전용이므로
 * productId/warehouseId UUID 노출은 허용. 일반 사용자 대면 화면에서는 UUID 직접 노출 금지.
 */
@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class SafetyStockController {

    private final SafetyStockService safetyStockService;

    /**
     * 현재 가용 재고가 안전재고 임계값 이하인 제품 목록을 조회한다.
     *
     * <p>warehouseId 가 null 인 설정(전체 합산 기준)은 해당 제품의 모든 창고 availableQty 합산과 비교한다.
     * warehouseId 가 지정된 설정은 해당 (productId, warehouseId) 의 availableQty 와 비교한다.
     *
     * @return 임계 이하 제품의 {@link SafetyStockAlertResponse} 목록 (빈 리스트 가능)
     */
    @Operation(
            summary = "안전재고 알림 목록 조회",
            description = "현재 가용 재고가 설정된 임계값 이하인 제품 목록 반환 (P1-3)"
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공 (임계 미만 없으면 빈 리스트)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/alerts/safety-stock")
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','INVENTORY')")
    public ApiResponse<List<SafetyStockAlertResponse>> listAlerts() {
        return ApiResponse.ok(safetyStockService.findAlerts());
    }

    /**
     * 제품별 안전재고 임계값을 설정하거나 기존 값을 갱신한다.
     *
     * <p>동일 (productId, warehouseId) 조합이 이미 존재하면 upsert(갱신) 처리한다.
     * productId 유효성은 product-service 에 internal 호출로 검증한다.
     *
     * @param productId 대상 제품 UUID (path variable)
     * @param request   임계값 설정 요청 (warehouseId / threshold / note)
     * @return 설정 결과 {@link SafetyStockConfigResponse} (201)
     */
    @Operation(
            summary = "안전재고 임계값 설정",
            description = "제품별(창고별) 안전재고 임계값 설정 또는 갱신 (upsert). productId 는 product-service 에서 검증 (P1-3)"
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201",
                    description = "설정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "입력값 오류 (threshold 0 미만 등)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "제품 미존재")
    })
    @PostMapping("/products/{productId}/safety-stock")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','INVENTORY')")
    public ApiResponse<SafetyStockConfigResponse> setSafetyStock(
            @PathVariable UUID productId,
            @Valid @RequestBody SafetyStockSetRequest request) {
        return ApiResponse.ok(safetyStockService.setSafetyStock(productId, request));
    }
}
