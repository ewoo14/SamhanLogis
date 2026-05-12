package com.samhanair.logis.partnerauth.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.dto.UpdatePartnerApprovalStatusRequest;
import com.samhanair.logis.partnerauth.service.PartnerApprovalService;
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
 */
@RestController
@RequestMapping("/api/v1/partner-approvals")
@RequiredArgsConstructor
public class PartnerApprovalsController {

    private final PartnerApprovalService partnerApprovalService;

    @Operation(summary = "주문서 승인 목록", description = "page/size/status 필터로 거래처 승인 status 목록 조회")
    @GetMapping
    public ApiResponse<Page<PartnerApprovalResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) PartnerApprovalStatus status) {
        return ApiResponse.ok(partnerApprovalService.list(status, PageRequest.of(page, size)));
    }

    @Operation(summary = "거래처 승인 status 변경", description = "영업자 화면 DropdownSelect 토글")
    @PatchMapping("/{partnerCode}/status")
    public ApiResponse<PartnerApprovalResponse> updateStatus(
            @PathVariable String partnerCode,
            @Valid @RequestBody UpdatePartnerApprovalStatusRequest request) {
        return ApiResponse.ok(partnerApprovalService.updateStatus(partnerCode, request.status()));
    }

    @Operation(summary = "거래처 비밀번호 강제 초기화",
            description = "PASSWORD_RESET_PENDING 으로 전환 + 거래처 다음 접속 시 재설정 페이지 자동 표시")
    @PostMapping("/{partnerCode}/reset-password")
    public ApiResponse<PartnerApprovalResponse> resetPassword(@PathVariable String partnerCode) {
        return ApiResponse.ok(partnerApprovalService.resetPassword(partnerCode));
    }
}
