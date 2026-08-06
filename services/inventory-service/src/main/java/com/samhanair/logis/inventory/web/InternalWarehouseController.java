package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.EcountWarehouseAliasRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseAliasResponse;
import com.samhanair.logis.inventory.web.dto.WarehouseByCodeResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * inventory-service 내부(internal) 창고 조회 endpoint.
 *
 * <p>경로 prefix {@code /internal/} — SecurityConfig 의 {@code InternalTokenFilter} 가
 * X-Internal-Token 헤더를 검증하고, 컨트롤러는 {@code ROLE_MASTER} 내부 주체만 허용한다.
 *
 * <p>현재 제공 endpoint:
 * <ul>
 *   <li>{@code GET /internal/inventory/warehouses/by-code?code=} — warehouseCode → UUID 역조회</li>
 *   <li>{@code GET /internal/inventory/warehouses/by-ecount-codes?codes=} — staging alias 일괄 조회</li>
 *   <li>{@code GET /internal/inventory/warehouses/{id}} — warehouseId(UUID) → 창고명 조회</li>
 * </ul>
 */
@RestController
@RequestMapping("/internal/inventory/warehouses")
@RequiredArgsConstructor
public class InternalWarehouseController {

    private final WarehouseRepository warehouseRepository;
    private final EcountWarehouseAliasRepository ecountWarehouseAliasRepository;

    /**
     * eCount 코드 → 내부 창고 UUID alias를 권위 staging 원본에서 일괄 조회한다.
     *
     * <p>기존 {@code by-code}는 {@code warehouses.code}를 조회하는 legacy 내부 계약이다.
     * eCount 코드는 같은 namespace라고 가정할 수 없으므로, 매핑 검증은 반드시 이 endpoint를
     * 사용한다. 결과에 없는 코드는 실제 alias 부재이며, HTTP 오류는 호출자에서 장애로 분류한다.
     *
     * @param codes comma-separated eCount codes
     * @return staging alias 중 활성 warehouse에 연결된 행
     */
    @Operation(
            summary = "eCount 창고 코드 alias 일괄 조회 (internal)",
            description = "staging.ecount_warehouse_map을 권위 원본으로 사용. X-Internal-Token 인증 필수."
    )
    @GetMapping("/by-ecount-codes")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<EcountWarehouseAliasResponse>> byEcountCodes(
            @RequestParam(name = "codes") String codes) {
        Set<String> requestedCodes = parseCodes(codes);
        return ApiResponse.ok(ecountWarehouseAliasRepository.findActiveByEcountCodes(requestedCodes));
    }

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
    @PreAuthorize("hasRole('MASTER')")
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

    /**
     * 창고 UUID 로 내부 서비스용 창고 요약을 조회한다.
     *
     * <p>slip-service 입고전표 생성 경로에서 {@code destinationWarehouseId} 로 창고명을
     * snapshot 할 때 사용하는 내부 계약이다. 공개 창고 상세 endpoint 와 달리 사용자 헤더
     * 없이 {@code X-Internal-Token} 으로 인증된 서비스 호출만 허용한다.
     *
     * @param id 창고 UUID
     * @return 창고 UUID / code / name 응답
     * @throws BusinessException(NOT_FOUND) 해당 UUID 의 활성 창고가 없을 때
     */
    @Operation(
            summary = "창고 UUID 단건 조회 (internal)",
            description = "warehouseId(UUID) 로 창고 code/name 을 조회. X-Internal-Token 인증 필수."
    )
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "해당 UUID 의 창고 없음"),
    })
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<WarehouseByCodeResponse> byId(@PathVariable UUID id) {
        Warehouse warehouse = warehouseRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "창고를 찾을 수 없습니다"));
        return ApiResponse.ok(new WarehouseByCodeResponse(
                warehouse.getId(), warehouse.getCode(), warehouse.getName()));
    }

    private Set<String> parseCodes(String codes) {
        if (codes == null || codes.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "codes 파라미터는 필수입니다");
        }
        Set<String> parsed = new LinkedHashSet<>(Arrays.stream(codes.split(","))
                .map(String::trim)
                .filter(code -> !code.isBlank())
                .toList());
        if (parsed.isEmpty() || parsed.size() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "codes 파라미터는 1~100개의 eCount 코드를 가져야 합니다");
        }
        return parsed;
    }
}
