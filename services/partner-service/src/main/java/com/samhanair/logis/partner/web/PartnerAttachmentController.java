package com.samhanair.logis.partner.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partner.domain.AttachmentType;
import com.samhanair.logis.partner.service.PartnerAttachmentService;
import com.samhanair.logis.partner.web.dto.PartnerAttachmentResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 거래처 첨부 파일 REST 엔드포인트 (사업자등록증 / 명함 / 세금계산서 / 계약서 / 기타).
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>업로드 / 삭제 — SALES / MANAGER / MASTER</li>
 *   <li>조회 (목록 / 상세) — 모든 인증 사용자</li>
 * </ul>
 *
 * <p>응답은 모두 {@link ApiResponse} envelope 로 wrap (memory: D-P10-12 일관).
 */
@RestController
@RequestMapping("/api/v1/partners")
@RequiredArgsConstructor
public class PartnerAttachmentController {

    private final PartnerAttachmentService attachmentService;

    /**
     * 첨부 업로드 (multipart/form-data).
     *
     * <p>form 필드:
     * <ul>
     *   <li>{@code type} — AttachmentType enum 명 (BIZ_LICENSE 등)</li>
     *   <li>{@code file} — multipart 파일 (≤ 10MB, image/png / image/jpeg / application/pdf)</li>
     *   <li>{@code description} — 비고 (선택)</li>
     * </ul>
     */
    @Operation(summary = "거래처 첨부 파일 업로드",
            description = "사업자등록증/명함/세금계산서/계약서. SALES/MANAGER/MASTER 권한 필요")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미존재")
    })
    @PostMapping(value = "/{partnerId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "partners.detail", action = "EDIT")
    public ApiResponse<PartnerAttachmentResponse> upload(
            @PathVariable UUID partnerId,
            @RequestParam("type") AttachmentType type,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "description", required = false) String description,
            Principal principal) {
        UUID uploaderId = resolveUserUuid(principal);
        return ApiResponse.ok(PartnerAttachmentResponse.from(
                attachmentService.upload(partnerId, type, file, description, uploaderId),
                null));
    }

    /** 거래처별 첨부 목록 (downloadUrl 미포함 — 상세 조회 시 발급). */
    @Operation(summary = "거래처 첨부 목록 조회")
    @GetMapping("/{partnerId}/attachments")
    @RequirePermission(page = "partners.detail", action = "VIEW")
    public ApiResponse<List<PartnerAttachmentResponse>> list(@PathVariable UUID partnerId) {
        List<PartnerAttachmentResponse> items = attachmentService.list(partnerId).stream()
                .map(PartnerAttachmentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 첨부 상세 + presigned downloadUrl (1시간 유효) 발급. */
    @Operation(summary = "첨부 상세 + presigned 다운로드 URL 발급",
            description = "downloadUrl 은 1시간 유효 — 만료 시 본 endpoint 재호출")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "첨부 미존재")
    })
    @GetMapping("/attachments/{attachmentId}")
    @RequirePermission(page = "partners.detail", action = "VIEW")
    public ApiResponse<PartnerAttachmentResponse> detail(@PathVariable UUID attachmentId) {
        PartnerAttachmentService.DownloadView view = attachmentService.download(attachmentId);
        return ApiResponse.ok(
                PartnerAttachmentResponse.from(view.attachment(), view.downloadUrl()));
    }

    /** 첨부 soft-delete (MinIO 객체는 보존). */
    @Operation(summary = "첨부 soft-delete",
            description = "SALES/MANAGER/MASTER 권한 필요. MinIO 객체는 감사 추적 위해 보존")
    @DeleteMapping("/attachments/{attachmentId}")
    @RequirePermission(page = "partners.detail", action = "EDIT")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID attachmentId,
                                                    Principal principal) {
        UUID deleter = resolveUserUuid(principal);
        attachmentService.delete(attachmentId, deleter);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    /**
     * Principal name 이 UUID 형식이면 그대로, 아니면 deterministic UUID 로 변환.
     * gateway 가 X-User-Id 헤더로 employee UUID 를 전달한다는 전제.
     */
    private static UUID resolveUserUuid(Principal principal) {
        String name = (principal == null) ? null : principal.getName();
        if (name == null || name.isBlank()) {
            return UUID.nameUUIDFromBytes("anonymous".getBytes());
        }
        try {
            return UUID.fromString(name);
        } catch (IllegalArgumentException ex) {
            return UUID.nameUUIDFromBytes(name.getBytes());
        }
    }
}
