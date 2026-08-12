package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.web.dto.DraftCreateRequest;
import com.samhanair.logis.partnerorder.web.dto.DraftDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import com.samhanair.logis.partnerorder.web.dto.WebPartnerOrderDraftListResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 임시저장 (saveOrderSnapshot/getOrderSnapshotHistory) endpoint.
 *
 * <p>권한 — 모든 거래처 인증 사용자 (PARTNER role) + admin (MASTER/MANAGER).
 * UUID 비공개 — 응답은 draftSeq + label 만 사용자 노출 (FE 가드).
 */
@RestController
@RequestMapping("/api/v1/partner-orders/drafts")
@RequiredArgsConstructor
public class PartnerOrderDraftController {

    private static final String USER_ID_HEADER = "X-User-Id";

    private final PartnerOrderDraftService draftService;

    /**
     * 임시저장 1건 생성 (legacy saveOrderSnapshot/saveDraft).
     *
     * @return 201, DraftResponse
     */
    @Operation(summary = "임시저장 생성", description = "30일 TTL — 거래처별 draftSeq 자동 부여")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "sales.partner-order.draft", action = PermissionAction.CREATE,
            partnerSelfService = true)
    public ApiResponse<DraftResponse> create(
            @Valid @RequestBody DraftCreateRequest request,
            @RequestHeader(value = HttpHeaderConstants.PARTNER_CODE_HEADER, required = false) String partnerCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId) {
        return ApiResponse.ok(draftService.create(partnerCode, fallback(userId), request));
    }

    /**
     * 임시저장 페이지 조회 (legacy getOrderSnapshotHistory). 본인 거래처만.
     */
    @Operation(summary = "임시저장 페이지 조회", description = "본인 거래처 createdAt DESC")
    @GetMapping
    @RequirePermission(page = "sales.partner-order.draft", action = PermissionAction.VIEW,
            partnerSelfService = true)
    public ApiResponse<Page<DraftResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = HttpHeaderConstants.PARTNER_CODE_HEADER, required = false) String partnerCode) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(draftService.list(partnerCode, from, to, pageable));
    }

    /** 내부 영업 데스크톱의 웹 주문서 source 목록. UUID와 payload는 반환하지 않는다. */
    @GetMapping("/desktop-list")
    @RequirePermission(page = "sales.partner-order.list", action = PermissionAction.VIEW)
    public ApiResponse<List<WebPartnerOrderDraftListResponse>> desktopList() {
        return ApiResponse.ok(draftService.desktopList());
    }

    /**
     * 임시저장 단건 상세 (payload 포함).
     */
    @Operation(summary = "임시저장 단건 조회", description = "payload 포함 상세")
    @GetMapping("/{draftId}")
    @RequirePermission(page = "sales.partner-order.draft", action = PermissionAction.VIEW,
            partnerSelfService = true)
    public ApiResponse<DraftDetailResponse> getOne(
            @PathVariable UUID draftId,
            @RequestHeader(value = HttpHeaderConstants.PARTNER_CODE_HEADER, required = false) String partnerCode) {
        return ApiResponse.ok(draftService.getOne(partnerCode, draftId));
    }

    private String fallback(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
