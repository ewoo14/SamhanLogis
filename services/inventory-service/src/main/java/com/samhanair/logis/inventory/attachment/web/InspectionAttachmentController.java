package com.samhanair.logis.inventory.attachment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.attachment.service.InspectionAttachmentService;
import com.samhanair.logis.inventory.attachment.web.dto.InspectionAttachmentResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 입고 검수 사진 첨부 REST endpoint — P1 (검수 사진 첨부).
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md} §검수 사진 첨부 (입고).
 *
 * <p>경로 매핑 — gateway StripPrefix=2 후 도달하는 경로 기준 ({@code /inventory/inspections/...}).
 * mobile/desktop client 는 풀 URL {@code /api/v1/inventory/inspections/{slipId}/attachments} 호출.
 * P0-9 {@link com.samhanair.logis.inventory.web.InboundInspectionController} 풀패스 매핑 패턴과 일관 유지.
 *
 * <p>경로 변수 의미:
 * <ul>
 *   <li>{@code slipId} — slip-service Slip UUID. 내부에서 InboundInspection 으로 lookup.
 *       검수 레코드가 없으면 404 (먼저 {@code /api/v1/inventory/inbound-inspections/{slipId}} 진입 의무).</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>업로드 — WAREHOUSE / DRIVER / MANAGER / MASTER (DRIVER 도 검수 사진 촬영 가능 — 매뉴얼)</li>
 *   <li>조회 / 다운로드 — 모든 인증 사용자</li>
 *   <li>삭제 — MANAGER / MASTER</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — slipId 는 path variable 로만 사용. 사용자 화면은 slipNo / fileName 만 노출.
 */
@RestController
@RequestMapping("/inventory/inspections/{slipId}/attachments")
@RequiredArgsConstructor
public class InspectionAttachmentController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final InspectionAttachmentService attachmentService;

    /**
     * 검수 사진 업로드 (multipart/form-data).
     *
     * <p>form 필드:
     * <ul>
     *   <li>{@code file} — multipart 파일 (≤5MB, image/jpeg / image/png)</li>
     *   <li>{@code exifGpsLat} / {@code exifGpsLng} — EXIF GPS (선택)</li>
     *   <li>{@code capturedAt} — EXIF 촬영 시각 (선택, ISO-8601)</li>
     *   <li>{@code description} — 비고 (선택 — 불량 내용 등)</li>
     * </ul>
     *
     * @param slipId       slip-service Slip UUID (path variable)
     * @param file         multipart 사진 파일
     * @param exifGpsLat   EXIF GPS 위도 (선택)
     * @param exifGpsLng   EXIF GPS 경도 (선택)
     * @param capturedAt   EXIF 촬영 시각 (선택)
     * @param description  비고 (선택)
     * @param callerHeader X-User-Id 헤더
     * @return 201 + InspectionAttachmentResponse
     */
    @Operation(summary = "검수 사진 업로드",
            description = "WAREHOUSE/MANAGER/MASTER 권한. ≤5MB, image/jpeg·png 만 허용. EXIF GPS 선택 첨부")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "검수 레코드 미존재")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "EDIT")
    public ApiResponse<InspectionAttachmentResponse> upload(
            @PathVariable UUID slipId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt,
            @RequestParam(value = "description", required = false) String description,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        String uploaderId = callerOrSystem(callerHeader);
        return ApiResponse.ok(InspectionAttachmentResponse.from(
                attachmentService.upload(slipId, file, exifGpsLat, exifGpsLng,
                        capturedAt, uploaderId, description)));
    }

    /**
     * 슬립 ID 기준 첨부 목록 — soft-deleted 자동 제외.
     * 검수 레코드가 없으면 빈 목록 반환 (404 대신 graceful empty — desktop viewer 가 시작 시 호출).
     *
     * @param slipId slip-service Slip UUID
     * @return 목록 (downloadUrl 은 캐시 — 만료 가능, 정확한 URL 은 단건 GET)
     */
    @Operation(summary = "검수 첨부 목록 조회",
            description = "slipId 기준 업로드 시각 오름차순. 검수 레코드 없으면 빈 목록. "
                    + "downloadUrl 은 캐시(만료 가능)")
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<InspectionAttachmentResponse>> list(@PathVariable UUID slipId) {
        List<InspectionAttachmentResponse> items = attachmentService.listBySlipId(slipId).stream()
                .map(InspectionAttachmentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /**
     * 단건 조회 + presigned downloadUrl (1시간 유효) 발급.
     *
     * @param slipId       slip-service Slip UUID (path variable)
     * @param attachmentId InspectionAttachment UUID
     * @return 단건 응답 (freshUrl 포함)
     */
    @Operation(summary = "검수 첨부 단건 + presigned 다운로드 URL 발급",
            description = "downloadUrl 은 1시간 유효 — 만료 시 본 endpoint 재호출")
    @GetMapping("/{attachmentId}")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<InspectionAttachmentResponse> detail(
            @PathVariable UUID slipId,
            @PathVariable UUID attachmentId) {
        InspectionAttachmentService.DownloadView view = attachmentService.download(attachmentId);
        return ApiResponse.ok(
                InspectionAttachmentResponse.from(view.attachment(), view.downloadUrl()));
    }

    /**
     * 검수 첨부 soft-delete (MinIO 객체는 보존).
     *
     * @param slipId       slip-service Slip UUID (path variable)
     * @param attachmentId InspectionAttachment UUID
     * @param callerHeader X-User-Id 헤더
     * @return 200
     */
    @Operation(summary = "검수 첨부 soft-delete",
            description = "MANAGER/MASTER 권한. MinIO 객체는 감사 추적 위해 보존")
    @DeleteMapping("/{attachmentId}")
    @PreAuthorize("hasAnyRole('MANAGER','MASTER')")
    @RequirePermission(page = "inventory.stock-balance", action = "EDIT")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable UUID slipId,
            @PathVariable UUID attachmentId,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        attachmentService.delete(attachmentId, callerOrSystem(callerHeader));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
