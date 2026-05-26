package com.samhanair.logis.partner.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partner.dto.BlockedPartnerCreateRequest;
import com.samhanair.logis.partner.dto.BlockedPartnerImportResult;
import com.samhanair.logis.partner.dto.BlockedPartnerResponse;
import com.samhanair.logis.partner.service.PartnerBlockImportService;
import com.samhanair.logis.partner.service.PartnerBlockService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.io.IOException;
import java.security.Principal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Phase 10 PR-D Part B — BLOCK 발송금지 admin endpoint (4 operation).
 *
 * <p>인증 = X-User-Role 헤더 (gateway 경유):
 * <ul>
 *   <li>read (GET) = MASTER / MANAGER</li>
 *   <li>create (POST 단건) = MASTER / MANAGER</li>
 *   <li>import (POST multipart CSV) = MASTER 만 (사용자 명시 — bulk 작업 권한 분리)</li>
 *   <li>delete (DELETE 차단해제) = MASTER 만</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 응답은 partnerCode + business_name snapshot + reason + blocked_at 만 노출.
 * 차단 해제 path variable 의 id 는 BLOCK row UUID — 사용자 화면에서 노출하지 않고 admin 운영
 * 도구에서만 path 로 사용 (Notion / Sheet sync 도 partnerCode 기반).
 */
@RestController
@RequestMapping("/api/v1/partners/admin/blocks")
@RequiredArgsConstructor
public class PartnerBlockAdminController {

    private final PartnerBlockService blockService;
    private final PartnerBlockImportService importService;

    /**
     * BLOCK 목록 페이지 조회 — admin 화면 backing.
     *
     * @param page 0-based
     * @param size 페이지 크기 (기본 20)
     * @return 200 + Page<BlockedPartnerResponse>
     */
    @Operation(summary = "BLOCK 발송금지 목록 페이지 조회",
            description = "MASTER / MANAGER 권한. blocked_at 역순 정렬.")
    @GetMapping
    @RequirePermission(page = "partners.block", action = "VIEW")
    public ApiResponse<Page<BlockedPartnerResponse>> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "blockedAt"));
        Page<BlockedPartnerResponse> result = blockService.findAll(pageable)
                .map(BlockedPartnerResponse::from);
        return ApiResponse.ok(result);
    }

    /**
     * 단건 BLOCK 등록 (partnerCode 직접 입력).
     *
     * <p>partnerCode 가 partners 마스터에 미존재 → 404. 이미 차단된 경우 → 409.
     */
    @Operation(summary = "BLOCK 단건 등록", description = "partnerCode + 차단 사유 입력. MASTER / MANAGER.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "partnerCode 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 차단됨")
    })
    @PostMapping
    @RequirePermission(page = "partners.block", action = "EDIT")
    public ApiResponse<BlockedPartnerResponse> create(
            @Valid @RequestBody BlockedPartnerCreateRequest req) {
        return ApiResponse.ok(BlockedPartnerResponse.from(
                blockService.block(req.partnerCode(), req.blockReason())));
    }

    /**
     * CSV multipart import (Notion 발송금지 export).
     *
     * <p>업로드된 CSV 의 각 row 사업자명을 partnerService.findByNameForLookup 으로 partnerCode
     * 역추적, 매칭 성공 row 만 BLOCK 등록. 결과는 4 카테고리 (totalRows / imported / alreadyBlocked /
     * rejected). source = NOTION_IMPORT 로 저장.
     */
    @Operation(summary = "CSV import (Notion 발송금지 export)",
            description = "MASTER 권한. UTF-8 BOM + 한국어 datetime 자동 처리.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "import 결과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "CSV 형식 오류")
    })
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "partners.block.bulk", action = "EDIT")
    public ApiResponse<BlockedPartnerImportResult> importCsv(
            @RequestParam("file") MultipartFile file,
            Principal principal) throws IOException {
        String actor = principal != null ? principal.getName() : "system";
        return ApiResponse.ok(importService.importCsv(file.getInputStream(), actor));
    }

    /**
     * 차단 해제 (soft-delete). partial unique index 가 partnerCode 재차단 허용.
     */
    @Operation(summary = "BLOCK 해제 (soft-delete)", description = "MASTER 권한. id = BLOCK row UUID.")
    @DeleteMapping("/{id}")
    @RequirePermission(page = "partners.block.bulk", action = "EDIT")
    public ResponseEntity<ApiResponse<Void>> unblock(
            @PathVariable UUID id,
            Principal principal) {
        String actor = principal != null ? principal.getName() : "system";
        blockService.unblock(id, actor);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
