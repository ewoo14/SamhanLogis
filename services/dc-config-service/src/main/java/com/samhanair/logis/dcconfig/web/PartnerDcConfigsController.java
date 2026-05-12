package com.samhanair.logis.dcconfig.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dcconfig.dto.PartnerDcConfigResponse;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * 데스크탑 영업 "거래처 DC 설정" 화면(`/sales/partner-dc-config`) 외부 노출 endpoints.
 *
 * <p>frontend (`clients/desktop/src/renderer/api/sales.ts`) 의
 * {@code listPartnerDcConfigs / updatePartnerDcConfig} 와 1:1 path.
 *
 * <p>본 endpoint 는 기존 internal `/internal/partner-dc-configs/{partnerCode}` 와 다른 외부 path.
 * DC 노출 5겹 가드 유지 — gateway 의 `/internal/**` 외부 차단은 그대로.
 *
 * <p><b>본 PR scope (4b):</b>
 * <ul>
 *   <li>GET 목록 + keyword 검색 + pagination — 풀스택 구현</li>
 *   <li>PATCH 단건 — backend stub (501) 반환, 인라인 편집 동작은 다음 PR 에서 활성화</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/partner-dc-configs")
@RequiredArgsConstructor
public class PartnerDcConfigsController {

    private final DcConfigRepository dcConfigRepository;

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
            description = "본 PR 미구현 stub — 다음 PR 에서 외부 형식(%, ₩) ↔ 내부 BigDecimal 변환 보강 후 활성화")
    @PatchMapping("/{partnerCode}")
    public ApiResponse<PartnerDcConfigResponse> updateInline(
            @PathVariable String partnerCode,
            @RequestBody(required = false) Map<String, Object> patch) {
        throw new ResponseStatusException(
                HttpStatus.NOT_IMPLEMENTED,
                "거래처 DC 인라인 편집은 본 PR backlog — internal /internal/partner-dc-configs/{code} (PATCH/PUT) 활용 권장");
    }
}
