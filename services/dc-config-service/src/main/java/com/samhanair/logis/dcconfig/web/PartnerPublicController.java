package com.samhanair.logis.dcconfig.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dcconfig.dto.PartnerPublicResponse;
import com.samhanair.logis.dcconfig.service.PartnerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Partner public 컨트롤러 — Gateway 경유 외부 호출.
 *
 * <p>DC 노출 5겹 가드 의 1·2번째:
 * <ul>
 *   <li>DC 관련 service ({@code DcConfigService}) 의존성 주입 받지 않음 — 컴파일 타임 격리</li>
 *   <li>응답 DTO 는 {@link PartnerPublicResponse} 만 사용 — DC 필드 자체 부재</li>
 * </ul>
 *
 * <p>본 컨트롤러는 절대로 DC 정보를 노출하면 안 된다. DC 가 필요한 호출자는
 * {@link InternalDcConfigController} 의 X-Internal-Token 인증 endpoint 를 사용해야 함.
 */
@RestController
@RequestMapping("/partners")
@RequiredArgsConstructor
public class PartnerPublicController {

    private final PartnerService partnerService;

    /**
     * 거래처 단건 조회 (public). DC 정보 미포함.
     *
     * @param partnerCode 사용자 노출 식별자
     * @return PartnerPublicResponse (DC 필드 자체 부재)
     */
    @Operation(summary = "거래처 단건 조회 (public)",
            description = "DC 설정은 미노출. DC 가 필요한 호출자는 internal RPC + X-Internal-Token 사용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처를 찾을 수 없습니다")
    })
    @GetMapping("/{partnerCode}")
    public ApiResponse<PartnerPublicResponse> getOne(@PathVariable String partnerCode) {
        return ApiResponse.ok(PartnerPublicResponse.from(partnerService.getByPartnerCode(partnerCode)));
    }
}
