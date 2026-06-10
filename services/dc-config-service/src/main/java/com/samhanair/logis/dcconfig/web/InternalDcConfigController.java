package com.samhanair.logis.dcconfig.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dcconfig.dto.DcConfigResponse;
import com.samhanair.logis.dcconfig.dto.PartnerInternalResponse;
import com.samhanair.logis.dcconfig.dto.PriceCalculationRequest;
import com.samhanair.logis.dcconfig.dto.PriceCalculationResponse;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import com.samhanair.logis.dcconfig.service.PriceCalculationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal DC config 컨트롤러 — 서비스 간 RPC 전용. {@code /internal/**} 경로는
 * {@code InternalTokenFilter} 가 X-Internal-Token 으로 인증.
 *
 * <p>Gateway 는 {@code /internal/**} 외부 라우트 비등록 (DC 노출 5겹 가드 의 3번째).
 *
 * <p>호출자:
 * <ul>
 *   <li>M2 partner-service — 거래처 마스터 조회</li>
 *   <li>estimate-service / partner-order-service — 가격 계산</li>
 *   <li>mobile/web 클라이언트 — 자기 거래처 DC 설정 조회 (gateway 우회 internal 라우트)</li>
 * </ul>
 */
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
public class InternalDcConfigController {

    private final DcConfigService dcConfigService;
    private final PriceCalculationService priceCalculationService;

    /**
     * 거래처 + DC 설정 통합 조회 — M2 RPC 응답 nested 구조.
     */
    @Operation(summary = "거래처 + DC 설정 통합 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. Partner 미존재 시 404, DC 설정만 미존재면 dcConfig=null.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처를 찾을 수 없습니다")
    })
    @GetMapping("/partners/{partnerCode}")
    public ApiResponse<PartnerInternalResponse> getPartnerWithDc(@PathVariable String partnerCode) {
        DcConfigService.PartnerWithDc pair = dcConfigService.resolveByPartnerCode(partnerCode);
        return ApiResponse.ok(PartnerInternalResponse.from(pair.partner(), pair.dcConfig()));
    }

    /**
     * 3d 백로그 — partner-auth-service 가 로그인 직후 호출.
     *
     * <p>bizNo (사업자등록번호, '-' 제거 정규화 권장) 로 거래처 + DC 설정 통합 조회.
     * 응답 구조는 {@link #getPartnerWithDc} 와 동일.
     */
    @Operation(summary = "거래처 + DC 설정 통합 조회 — bizNo 키 (internal)",
            description = "X-Internal-Token 인증 후 호출. partner-auth-service 로그인 직후 사용. "
                    + "Partner 미존재 시 404, DC 설정만 미존재면 dcConfig=null.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처를 찾을 수 없습니다 (bizNo)")
    })
    @GetMapping("/partners/by-bizno/{bizNo}")
    public ApiResponse<PartnerInternalResponse> getPartnerWithDcByBizNo(@PathVariable String bizNo) {
        DcConfigService.PartnerWithDc pair = dcConfigService.resolveByBizNo(bizNo);
        return ApiResponse.ok(PartnerInternalResponse.from(pair.partner(), pair.dcConfig()));
    }

    /**
     * 전체 DC 설정 벌크 조회 — #31 estimate-app 이 거래처 목록 prefetch 시 호출
     * (legacy {@code getAllNotionDcConfigs_} 의 Notion 일괄 조회 대체).
     */
    @Operation(summary = "거래처 DC 설정 전체 벌크 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. 거래처별 DC리스트 전량(비페이징) 반환 — "
                    + "estimate-app 거래처 목록 prefetch 용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @GetMapping("/partner-dc-configs")
    public ApiResponse<java.util.List<DcConfigResponse>> listDcConfigs() {
        return ApiResponse.ok(dcConfigService.listAll().stream().map(DcConfigResponse::from).toList());
    }

    /**
     * DC 설정 단건 조회 — 가격 계산 화면이 호출.
     */
    @Operation(summary = "거래처 DC 설정 단건 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. DC 설정 미존재 시 404.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "DC 설정을 찾을 수 없습니다")
    })
    @GetMapping("/partner-dc-configs/{partnerCode}")
    public ApiResponse<DcConfigResponse> getDcConfig(@PathVariable String partnerCode) {
        return ApiResponse.ok(DcConfigResponse.from(dcConfigService.getByPartnerCode(partnerCode)));
    }

    /**
     * DC 적용 가격 계산. 모든 호출은 PriceCalculationLog 1 row insert.
     */
    @Operation(summary = "DC 적용 가격 계산 (internal)",
            description = "X-Internal-Token 인증 후 호출. 라인별 정상가 + 카테고리 + 옵션 -> 적용 단가. 감사 로그 자동 기록.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "계산 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "필수 파라미터 누락/유효성"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처를 찾을 수 없습니다")
    })
    @PostMapping("/price-calculations")
    public ApiResponse<PriceCalculationResponse> calculate(@Valid @RequestBody PriceCalculationRequest request) {
        return ApiResponse.ok(priceCalculationService.calculate(request));
    }
}
