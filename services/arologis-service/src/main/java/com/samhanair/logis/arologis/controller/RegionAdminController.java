package com.samhanair.logis.arologis.controller;

import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.arologis.domain.RegionDispatchClassification;
import com.samhanair.logis.arologis.dto.RegionResponse;
import com.samhanair.logis.arologis.dto.RegionUpsertRequest;
import com.samhanair.logis.arologis.service.RegionImportService;
import com.samhanair.logis.arologis.service.RegionService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 가배차 지역 분류 admin endpoint — Phase 10 W10-1 PR-D Part 2-1.
 *
 * <p>Samhan Public 프로그램 native 이식 — 노션 직접 통신 X. CSV 데이터 우리 DB 에 native 저장.
 *
 * <p>인증 = X-User-* 헤더 + {@code @PreAuthorize("hasAnyRole('MASTER','MANAGER','DISPATCH')")}.
 * UUID 비공개 가드 — 사용자 노출 식별자 = group_name. id 는 admin routing 용.
 *
 * <p>endpoint:
 * <ul>
 *   <li>GET /admin/arologis/regions — 전체 조회</li>
 *   <li>POST /admin/arologis/regions — 단건 추가</li>
 *   <li>POST /admin/arologis/regions/import — CSV 일괄 import (multipart)</li>
 *   <li>PUT /admin/arologis/regions/{id} — 단건 수정 (keywords/sortOrder)</li>
 *   <li>DELETE /admin/arologis/regions/{id} — Soft Delete</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/admin/arologis/regions")
@RequiredArgsConstructor
public class RegionAdminController {

    private final RegionService regionService;
    private final RegionImportService importService;

    private static final String ROLE_HEADER = "X-User-Role";

    /** 전체 활성 분류 조회 (sort_order 오름차순). */
    @Operation(summary = "지역 분류 전체 조회 (Admin)")
    @GetMapping
    @RequirePermission(page = "arologis.region", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<RegionResponse>> list(
            @org.springframework.web.bind.annotation.RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        List<RegionDispatchClassification> all = regionService.findAll();
        return ApiResponse.ok(all.stream().map(RegionResponse::from).toList());
    }

    /** 단건 신규 등록 — group_name 활성 행 unique. */
    @Operation(summary = "지역 분류 단건 추가 (Admin)")
    @PostMapping
    @RequirePermission(page = "arologis.region.manage", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<RegionResponse> create(
            @Valid @RequestBody RegionUpsertRequest req,
            @org.springframework.web.bind.annotation.RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        if (req.groupName() == null || req.groupName().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "groupName 필수");
        }
        RegionDispatchClassification saved = regionService.create(
                req.groupName(), req.keywords(), req.sortOrder());
        return ApiResponse.ok(RegionResponse.from(saved));
    }

    /**
     * CSV 일괄 import — multipart 업로드. UTF-8 BOM 자동 처리.
     *
     * <p>응답 = {@code {inserted, updated, rejected: [{rowNumber, rawData, reason}]}}.
     */
    @Operation(summary = "지역 분류 CSV 일괄 import (Admin)",
            description = "노션 export CSV (UTF-8 BOM, RFC4180 quoted) 우리 DB native upsert")
    @PostMapping("/import")
    @RequirePermission(page = "arologis.region.manage", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<RegionImportService.ImportResult> importCsv(
            @RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        try {
            RegionImportService.ImportResult result = importService.importCsv(file.getInputStream());
            log.info("RegionAdminController CSV import — file={}, inserted={}, updated={}, rejected={}",
                    file.getOriginalFilename(), result.inserted(), result.updated(), result.rejected().size());
            return ApiResponse.ok(result);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        } catch (IOException | CsvValidationException ex) {
            log.error("CSV import 실패 — file={}", file.getOriginalFilename(), ex);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "CSV 파싱 실패: " + ex.getMessage());
        }
    }

    /** 단건 수정 — keywords + sortOrder. group_name 불변. */
    @Operation(summary = "지역 분류 단건 수정 (Admin)")
    @PutMapping("/{id}")
    @RequirePermission(page = "arologis.region.manage", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<RegionResponse> update(
            @PathVariable UUID id, @Valid @RequestBody RegionUpsertRequest req) {
        RegionDispatchClassification updated = regionService.update(id, req.keywords(), req.sortOrder());
        return ApiResponse.ok(RegionResponse.from(updated));
    }

    /** Soft Delete — admin 전용. */
    @Operation(summary = "지역 분류 Soft Delete (Admin)")
    @DeleteMapping("/{id}")
    @RequirePermission(page = "arologis.region.manage", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<Map<String, String>> softDelete(
            @PathVariable UUID id, HttpServletRequest request) {
        String userId = request.getHeader("X-User-Id");
        regionService.softDelete(id, userId);
        return ApiResponse.ok(Map.of("id", id.toString(), "deleted", "true"));
    }
}
