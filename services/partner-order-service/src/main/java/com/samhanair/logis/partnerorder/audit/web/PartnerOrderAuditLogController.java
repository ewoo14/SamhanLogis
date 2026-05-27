package com.samhanair.logis.partnerorder.audit.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.audit.web.dto.PartnerOrderAuditLogResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 audit overlay REST endpoint — PR-H4b (Phase 12 Step 4b BE-C).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /api/v1/partner-orders/{partnerOrderId}/audit-logs} — audit timeline (최신 revision 우선)</li>
 * </ul>
 *
 * <p>권한 — 모든 인증 사용자 (주문 화면 표시).
 *
 * <p>본 PR 시범 한정 — overlay patch + revert endpoint 는 향후 슬라이스에서 도메인 별 patch
 * field 정의 후 추가 (slip-service PR-H2 와 동일 점진 도입 패턴).
 */
@RestController
@RequestMapping("/api/v1/partner-orders/{partnerOrderId}")
@RequiredArgsConstructor
public class PartnerOrderAuditLogController {

    private final PartnerOrderAuditLogService auditLogService;

    /**
     * 주문 audit timeline 조회 — 최신 revision 우선.
     */
    @Operation(summary = "거래처 주문 audit timeline",
            description = "PR-H4b — 주문 본문 수정 이력 (최신 revision 우선). soft-deleted 자동 제외")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
    })
    @GetMapping("/audit-logs")
    @RequirePermission(page = "sales.partner-order.history", action = "VIEW")
    public ApiResponse<List<PartnerOrderAuditLogResponse>> listAuditLogs(
            @PathVariable String partnerOrderId) {
        List<PartnerOrderAuditLogResponse> items = auditLogService.listByOrderIdentifier(partnerOrderId)
                .stream()
                .map(PartnerOrderAuditLogResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }
}
