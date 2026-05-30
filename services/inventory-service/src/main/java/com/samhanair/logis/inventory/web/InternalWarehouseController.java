package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.WarehouseByCodeResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * inventory-service 내부(internal) 창고 조회 endpoint.
 *
 * <p>경로 prefix {@code /internal/} — SecurityConfig 의 {@code InternalTokenFilter} 가
 * X-Internal-Token 헤더를 검증하므로 별도 권한 어노테이션 불필요 (gateway 미통과).
 *
 * <p>현재 제공 endpoint:
 * <ul>
 *   <li>{@code GET /internal/inventory/warehouses/by-code?code=} — warehouseCode → UUID 역조회</li>
 * </ul>
 */
@RestController
@RequestMapping("/internal/inventory/warehouses")
@RequiredArgsConstructor
public class InternalWarehouseController {

    private final WarehouseRepository warehouseRepository;

    /**
     * warehouseCode → UUID 역조회.
     *
     * <p>partner-order-service 가 출고전표 전환 시 warehouseCode 를 warehouseId(UUID)로
     * 변환하는 단일 출처(source-of-truth). slip-service 의 정적 yml 매핑(WarehouseCodeMapper)
     * 을 복제하지 않고 inventory DB 를 직접 조회한다.
     *
     * <p>인증: X-Internal-Token 필수 ({@code /internal/} prefix 경로 전용).
     *
     * @param code 창고 코드 (warehouseCode 파라미터, 빈 문자열 불가)
     * @return 창고 UUID / code / name 응답
     * @throws BusinessException(INVALID_INPUT) code 가 blank 일 때
     * @throws BusinessException(NOT_FOUND) 해당 코드의 활성 창고가 없을 때
     */
    @Operation(
            summary = "창고 코드 → UUID 역조회 (internal)",
            description = "warehouseCode 를 warehouseId(UUID)로 변환. X-Internal-Token 인증 필수."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "code 파라미터 누락 또는 빈 값"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "해당 코드의 창고 없음"),
    })
    @GetMapping("/by-code")
    public ApiResponse<WarehouseByCodeResponse> byCode(
            @RequestParam(name = "code") String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "code 파라미터는 필수입니다");
        }
        Warehouse warehouse = warehouseRepository.findByCode(code.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "창고 코드 '" + code + "' 를 찾을 수 없습니다"));
        return ApiResponse.ok(new WarehouseByCodeResponse(
                warehouse.getId(), warehouse.getCode(), warehouse.getName()));
    }
}
