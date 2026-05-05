package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.web.dto.DraftCreateRequest;
import com.samhanair.logis.partnerorder.web.dto.DraftDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    private final PartnerOrderDraftService draftService;

    /**
     * 임시저장 1건 생성 (legacy saveOrderSnapshot/saveDraft).
     *
     * @return 201, DraftResponse
     */
    @Operation(summary = "임시저장 생성", description = "30일 TTL — 거래처별 draftSeq 자동 부여")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','PARTNER')")
    public ApiResponse<DraftResponse> create(
            @Valid @RequestBody DraftCreateRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode,
            @RequestHeader(value = USER_ID_HEADER, required = false) String userId) {
        return ApiResponse.ok(draftService.create(partnerCode, fallback(userId), request));
    }

    /**
     * 임시저장 페이지 조회 (legacy getOrderSnapshotHistory). 본인 거래처만.
     */
    @Operation(summary = "임시저장 페이지 조회", description = "본인 거래처 createdAt DESC")
    @GetMapping
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','PARTNER')")
    public ApiResponse<Page<DraftResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(draftService.list(partnerCode, pageable));
    }

    /**
     * 임시저장 단건 상세 (payload 포함).
     */
    @Operation(summary = "임시저장 단건 조회", description = "payload 포함 상세")
    @GetMapping("/{draftId}")
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','PARTNER')")
    public ApiResponse<DraftDetailResponse> getOne(
            @PathVariable UUID draftId,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        return ApiResponse.ok(draftService.getOne(partnerCode, draftId));
    }

    private String fallback(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
