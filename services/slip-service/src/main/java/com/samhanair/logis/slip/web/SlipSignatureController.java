package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.web.dto.AdminSignatureResponse;
import com.samhanair.logis.slip.web.dto.InvalidateSignatureRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자 인수자 서명 endpoint — Slice C (signature-slice-C Plan §2 권한 매트릭스).
 *
 * <ul>
 *   <li>{@code GET /api/slips/{id}/signature} — MANAGER/MASTER 조회</li>
 *   <li>{@code DELETE /api/slips/{id}/signature} — MASTER only 무효화 (audit 강제)</li>
 * </ul>
 *
 * <p>application path: 본 controller 는 {@code /slips/{id}/signature} 매핑이지만 API Gateway
 * 가 {@code /api/slips/...} → {@code /slips/...} 로 prefix strip. SlipController 와 동일 컨벤션.
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipSignatureController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipSignatureService signatureService;

    /**
     * 서명 단건 조회 — MANAGER 또는 MASTER 만 호출 가능.
     *
     * @param id 슬립 UUID
     * @return 서명 메타 + PNG base64 (signed=false 면 모든 메타 null)
     */
    @Operation(summary = "관리자 서명 조회",
            description = "MANAGER/MASTER 권한. 서명 메타 + PNG base64 + hash 전체 64자 + share token 반환")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공 (signed=false 가능)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음 (SALES/WAREHOUSE/INVENTORY 등)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "슬립 미발견")
    })
    @GetMapping("/{id}/signature")
    @RequirePermission(page = "slip.signature", action = "VIEW")
    public ApiResponse<AdminSignatureResponse> getSignature(@PathVariable UUID id) {
        return ApiResponse.ok(signatureService.getSignature(id));
    }

    /**
     * 서명 무효화 — MASTER 권한자만. body {@code reason} 필수.
     *
     * <p>도메인 mutation 후 audit log INSERT (action=INVALIDATE, actorUserId=호출자).
     *
     * @param id 슬립 UUID
     * @param request {@code reason} (1~500자)
     * @param caller X-User-Id (필수, gateway 가 주입)
     * @return 무효화 후 응답 (signed=false)
     */
    @Operation(summary = "관리자 서명 무효화",
            description = "MASTER 권한 only. 5필드 NULL + audit log INVALIDATE INSERT. body reason 필수")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "무효화 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "reason 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "MASTER 외 권한"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "미서명 슬립 무효화 시도")
    })
    @DeleteMapping("/{id}/signature")
    @RequirePermission(page = "slip.signature", action = "EDIT")
    public ApiResponse<AdminSignatureResponse> invalidateSignature(
            @PathVariable UUID id,
            @Valid @RequestBody InvalidateSignatureRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String caller) {
        String actor = (caller == null || caller.isBlank()) ? "system" : caller;
        return ApiResponse.ok(signatureService.invalidateSignature(id, request.reason(), actor));
    }
}
