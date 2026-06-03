package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.CompensationRecoveryService;
import com.samhanair.logis.slip.web.dto.CompensationFailureResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 시리얼/배치 보상 실패 복구 API.
 *
 * <p>보상 실패는 재고 정합 관할 업무이므로 {@code inventory.list} 권한으로 보호한다.
 */
@RestController
// gateway slip-service-v1 route(Path=/api/v1/slips/**)가 StripPrefix=2('api','v1')를 적용하므로
// slip-service 컨벤션대로 strip 후 경로 `/slips/...`로 매핑한다(SlipController 등과 일관).
// 클라이언트/게이트웨이 노출 경로는 `/api/v1/slips/compensation-failures`. literal segment 가
// SlipController `/slips/{id}` 보다 우선 매칭되어 충돌 없음.
@RequestMapping("/slips/compensation-failures")
@RequiredArgsConstructor
public class CompensationRecoveryController {

    private final CompensationRecoveryService recoveryService;

    /**
     * 보상 실패 감사 행 목록을 조회한다.
     *
     * @param resolved 해소 여부. 기본값 false 로 미해소 건을 우선 표시한다.
     * @param pageable 페이지 요청
     * @return ApiResponse wrapper 안 보상 실패 page
     */
    @Operation(summary = "보상 실패 목록 조회",
            description = "시리얼/배치 보상 실패 감사 행을 해소 여부별 createdAt DESC 로 조회한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음")
    })
    @GetMapping
    @RequirePermission(page = "inventory.list", action = PermissionAction.VIEW)
    public ApiResponse<Page<CompensationFailureResponse>> list(
            @RequestParam(defaultValue = "false") boolean resolved,
            Pageable pageable) {
        return ApiResponse.ok(recoveryService.findFailures(resolved, pageable));
    }

    /**
     * 보상 실패 감사 행을 수동 정합 완료로 전이한다.
     *
     * @param id 보상 실패 감사 행 ID
     * @return ApiResponse wrapper 안 갱신된 보상 실패 응답
     */
    @Operation(summary = "보상 실패 해소 처리",
            description = "운영자가 수동 재고 정합을 완료한 보상 실패 감사 행을 resolved=true 로 전이한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "해소 처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "보상 실패 감사 행 없음")
    })
    @PatchMapping("/{id}/resolve")
    @RequirePermission(page = "inventory.list", action = PermissionAction.UPDATE)
    public ApiResponse<CompensationFailureResponse> resolve(@PathVariable UUID id) {
        return ApiResponse.ok(recoveryService.resolve(id));
    }
}
