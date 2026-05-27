package com.samhanair.logis.slip.attachment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipAttachmentResponse;
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
 * 슬립 첨부 파일 REST endpoint — P1-8 (Stage 4).
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md}.
 *
 * <p>권한 매트릭스 (매뉴얼 §4.4):
 * <ul>
 *   <li>업로드 — DRIVER, SALES, MANAGER, MASTER (DRIVER 는 본인 슬립 가드는 추후 §4.4 정식 활성)</li>
 *   <li>조회 / 다운로드 — 모든 인증 사용자</li>
 *   <li>삭제 — SALES, MANAGER, MASTER (24시간 내 본인 가드는 추후 정식 활성)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 본 응답은 UUID 식별자 포함 가능 (admin path), 단 공개 endpoint
 * ({@link com.samhanair.logis.slip.attachment.web.PublicSlipAttachmentController}) 는 slipNo 만 사용.
 */
@RestController
@RequestMapping("/slips/{slipId}/attachments")
@RequiredArgsConstructor
public class SlipAttachmentController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipAttachmentService attachmentService;

    /**
     * 첨부 업로드 (multipart/form-data).
     *
     * <p>form 필드:
     * <ul>
     *   <li>{@code type} — SlipAttachmentType (DELIVERY/INSPECTION/ESTIMATE)</li>
     *   <li>{@code file} — multipart 파일 (≤5MB, image/jpeg / image/png / application/pdf)</li>
     *   <li>{@code exifGpsLat} / {@code exifGpsLng} — EXIF GPS (선택)</li>
     *   <li>{@code capturedAt} — EXIF 촬영 시각 (선택, ISO-8601)</li>
     * </ul>
     */
    @Operation(summary = "슬립 첨부 파일 업로드",
            description = "DRIVER/SALES/MANAGER/MASTER 권한. EXIF GPS / capturedAt 메타 선택 첨부")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미존재")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "slip.attachments.upload", action = "EDIT")
    public ApiResponse<SlipAttachmentResponse> upload(
            @PathVariable UUID slipId,
            @RequestParam("type") SlipAttachmentType type,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "exifGpsLat", required = false) BigDecimal exifGpsLat,
            @RequestParam(value = "exifGpsLng", required = false) BigDecimal exifGpsLng,
            @RequestParam(value = "capturedAt", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime capturedAt,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        String uploaderId = callerOrSystem(callerHeader);
        return ApiResponse.ok(SlipAttachmentResponse.from(
                attachmentService.upload(slipId, type, file, exifGpsLat, exifGpsLng,
                        capturedAt, uploaderId)));
    }

    /** 슬립별 첨부 목록 (downloadUrl 은 캐시 — 만료 가능, 정확한 URL 은 단건 GET). */
    @Operation(summary = "슬립 첨부 목록 조회")
    @GetMapping
    @RequirePermission(page = "slip.attachments.upload", action = "VIEW")
    public ApiResponse<List<SlipAttachmentResponse>> list(@PathVariable UUID slipId) {
        List<SlipAttachmentResponse> items = attachmentService.list(slipId).stream()
                .map(SlipAttachmentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 첨부 단건 + presigned downloadUrl (1시간 유효) 발급. */
    @Operation(summary = "첨부 단건 + presigned 다운로드 URL 발급",
            description = "downloadUrl 은 1시간 유효 — 만료 시 본 endpoint 재호출")
    @GetMapping("/{attachmentId}")
    @RequirePermission(page = "slip.attachments.upload", action = "VIEW")
    public ApiResponse<SlipAttachmentResponse> detail(@PathVariable UUID slipId,
                                                      @PathVariable UUID attachmentId) {
        SlipAttachmentService.DownloadView view = attachmentService.download(attachmentId);
        return ApiResponse.ok(
                SlipAttachmentResponse.from(view.attachment(), view.downloadUrl()));
    }

    /** 첨부 soft-delete (MinIO 객체는 보존). */
    @Operation(summary = "첨부 soft-delete",
            description = "SALES/MANAGER/MASTER 권한. MinIO 객체는 감사 추적 위해 보존")
    @DeleteMapping("/{attachmentId}")
    @RequirePermission(page = "slip.attachments.delete", action = "EDIT")
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
