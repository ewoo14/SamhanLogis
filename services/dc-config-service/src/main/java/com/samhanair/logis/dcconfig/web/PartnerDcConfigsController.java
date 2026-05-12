package com.samhanair.logis.dcconfig.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.dto.PartnerDcConfigResponse;
import com.samhanair.logis.dcconfig.dto.UpdatePartnerDcConfigRequest;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 데스크탑 영업 "거래처 DC 설정" 화면(`/sales/partner-dc-config`) 외부 노출 endpoints.
 *
 * <p>frontend (`clients/desktop/src/renderer/api/sales.ts`) 의
 * {@code listPartnerDcConfigs / updatePartnerDcConfig} 와 1:1 path.
 *
 * <p>본 endpoint 는 기존 internal `/internal/partner-dc-configs/{partnerCode}` 와 다른 외부 path.
 * DC 노출 5겹 가드 유지 — gateway 의 `/internal/**` 외부 차단은 그대로.
 *
 * <p><b>4b backlog (현 PR 완료):</b>
 * <ul>
 *   <li>GET 목록 + keyword 검색 + pagination — 풀스택 구현</li>
 *   <li>PATCH 단건 — 외부 표시 문자열 ('46%', '₩70,000', 'Yes/No') ↔ 내부 BigDecimal/Boolean
 *       변환 보강 후 활성화 완료. DC 미설정 거래처는 PATCH 시 자동 생성.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/partner-dc-configs")
@RequiredArgsConstructor
public class PartnerDcConfigsController {

    private final DcConfigRepository dcConfigRepository;
    private final DcConfigService dcConfigService;

    @Operation(summary = "거래처 DC 설정 목록", description = "keyword (거래처명/거래처코드 LIKE) + page/size")
    @GetMapping
    public ApiResponse<Page<PartnerDcConfigResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String keyword) {
        String k = (keyword == null || keyword.isBlank()) ? null : keyword.trim();
        Page<PartnerDcConfigResponse> result = dcConfigRepository
                .search(k, PageRequest.of(page, size))
                .map(PartnerDcConfigResponse::from);
        return ApiResponse.ok(result);
    }

    @Operation(summary = "거래처 DC 설정 단건 수정 (인라인)",
            description = "외부 표시 문자열 그대로 송신 가능 ('46%', '₩70,000', 'Yes'/'No'). "
                    + "null/blank 필드는 변경 없음 (PATCH 시맨틱). DC 미설정 거래처는 자동 생성. "
                    + "Partner 자체가 미존재 시 404.")
    @PatchMapping("/{partnerCode}")
    public ApiResponse<PartnerDcConfigResponse> updateInline(
            @PathVariable String partnerCode,
            @RequestBody UpdatePartnerDcConfigRequest request) {
        DcConfig updated = dcConfigService.updatePartnerDcConfig(partnerCode, request);
        return ApiResponse.ok(PartnerDcConfigResponse.from(updated));
    }
}
