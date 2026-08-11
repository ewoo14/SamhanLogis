package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.SalesCommissionSettlementApprovalClaimService;
import com.samhanair.logis.accounting.web.dto.SettlementApprovalClaimRequest;
import com.samhanair.logis.accounting.web.dto.SettlementApprovalClaimResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** groupware-service 전용 정산 결재 claim endpoint. */
@RestController
@RequestMapping("/internal/accounting/settlement-approval-claims")
@RequiredArgsConstructor
public class AccountingInternalSettlementApprovalClaimController {

    private final SalesCommissionSettlementApprovalClaimService claimService;

    /** CONFIRMED 정산서의 결재별 claim 예약. */
    @Operation(summary = "정산 결재 참조 claim 예약 (internal)")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<SettlementApprovalClaimResponse> reserve(
            @Valid @RequestBody SettlementApprovalClaimRequest request) {
        return ApiResponse.ok(SettlementApprovalClaimResponse.from(
                claimService.reserve(request.documentNo(), request.approvalId())));
    }

    /** groupware 첨부 transaction이 준비된 뒤 claim을 활성화. */
    @Operation(summary = "정산 결재 참조 claim 활성화 (internal)")
    @PostMapping("/{claimToken}/activate")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<SettlementApprovalClaimResponse> activate(@PathVariable UUID claimToken) {
        return ApiResponse.ok(SettlementApprovalClaimResponse.from(claimService.activate(claimToken)));
    }

    /** 첨부 실패·삭제 시 claim 보상 해제. */
    @Operation(summary = "정산 결재 참조 claim 해제 (internal)")
    @DeleteMapping("/{claimToken}")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Void> release(@PathVariable UUID claimToken) {
        claimService.release(claimToken);
        return ApiResponse.ok(null);
    }

    /** 특정 결재·정산 참조 하나만 해제. */
    @Operation(summary = "특정 정산 결재 참조 claim 해제 (internal)")
    @DeleteMapping("/by-approval/{approvalId}/reference")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Void> releaseByApprovalReference(
            @PathVariable UUID approvalId, @RequestParam String documentNo) {
        claimService.releaseByApprovalReference(approvalId, documentNo);
        return ApiResponse.ok(null);
    }
}
