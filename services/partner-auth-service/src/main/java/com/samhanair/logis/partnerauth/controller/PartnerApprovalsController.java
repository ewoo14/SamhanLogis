package com.samhanair.logis.partnerauth.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.dto.UpdatePartnerApprovalStatusRequest;
import com.samhanair.logis.partnerauth.dto.PartnerAccessPreviewResponse;
import com.samhanair.logis.partnerauth.service.PartnerApprovalService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 데스크탑 영업 "주문서 승인" 화면(`/sales/order-approvals`) 외부 노출 endpoints.
 *
 * <p>frontend (`clients/desktop/src/renderer/api/sales.ts`) 의
 * {@code listPartnerApprovals / updatePartnerApprovalStatus / resetPartnerPassword} 와 1:1.
 *
 * <p>UUID 비공개 — 모든 path/응답 식별자는 {@code partnerCode} (= 사업자등록번호 / bizNo).
 *
 * <p>Phase 11 일괄 cutover 후에는 partner-service 와 통합 게이트 (DC 자동 적용 등) 가 추가될 예정.
 *
 * <p><b>동적 RBAC 가드 (PR #462 Round C #4 — P1 보안 fail-open 차단)</b>:
 * 본 3 endpoint 는 사내 영업 직원 전용 (거래처 승인상태 변경 / 비밀번호 강제 초기화) 이므로
 * {@link RequirePermission}{@code (page="sales.partner-order.list")} 로 동적 권한을 강제한다.
 * FE 좌측메뉴 게이트({@code showPartnerOrderList = canAccess('sales.partner-order.list','view')})와
 * page-code 가 정확히 일치한다. 가드 추가 전에는 {@code sales.partner-order.list} 권한이 없는
 * 인증 직원(WAREHOUSE/DISPATCH/INVENTORY 등)이 URL 직접 진입으로 승인변경·비번초기화가 가능했다.
 * <ul>
 *   <li>GET 목록 = {@link PermissionAction#VIEW}</li>
 *   <li>PATCH status = {@link PermissionAction#UPDATE}</li>
 *   <li>POST reset-password = {@link PermissionAction#UPDATE}</li>
 * </ul>
 * api-gateway {@code partner-auth-approvals-v1} 라우트가 {@code JwtAuthentication} 필터로
 * {@code X-User-Id} / {@code X-Is-System-Master} / {@code X-Is-Partner} 헤더를 주입하므로
 * {@link com.samhanair.logis.security.permission.PermissionAspect} 가 계정 단위로 검증한다
 * (MASTER bypass / PARTNER deny / 그 외 계정 권한 조회). {@code partnerSelfService} 는 미지정
 * (기본 {@code false}) — 거래처 본인은 승인 화면 접근 불가.
 */
@RestController
@RequestMapping("/api/v1/partner-approvals")
@RequiredArgsConstructor
public class PartnerApprovalsController {

    private final PartnerApprovalService partnerApprovalService;

    @Operation(summary = "주문서 승인 목록", description = "page/size/status 필터로 거래처 승인 status 목록 조회")
    @GetMapping
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<Page<PartnerApprovalResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) PartnerApprovalStatus status) {
        return ApiResponse.ok(partnerApprovalService.list(status, PageRequest.of(page, size)));
    }

    /** 기간별 장기미사용 후보를 비밀번호 초기화 전에 미리 보여준다. */
    @Operation(summary = "주문서 앱 접근권한 후보 미리보기",
            description = "주문·출고 활동과 생성시각 기준의 장기미사용 후보 및 조회 보류 상태 조회")
    @GetMapping("/access-preview")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<PartnerAccessPreviewResponse> accessPreview(
            @RequestParam(defaultValue = "30") int unusedDays) {
        return ApiResponse.ok(partnerApprovalService.previewLongUnusedReport(unusedDays));
    }

    @Operation(summary = "거래처 승인 status 변경", description = "영업자 화면 DropdownSelect 토글")
    @PatchMapping("/{partnerCode}/status")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerApprovalResponse> updateStatus(
            @PathVariable String partnerCode,
            @Valid @RequestBody UpdatePartnerApprovalStatusRequest request) {
        return ApiResponse.ok(partnerApprovalService.updateStatus(partnerCode, request.status()));
    }

    @Operation(summary = "거래처 비밀번호 강제 초기화",
            description = "PASSWORD_RESET_PENDING 으로 전환 + 거래처 다음 접속 시 재설정 페이지 자동 표시")
    @PostMapping("/{partnerCode}/reset-password")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerApprovalResponse> resetPassword(@PathVariable String partnerCode) {
        return ApiResponse.ok(partnerApprovalService.resetPassword(partnerCode));
    }
}
