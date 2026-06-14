package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentResponse;
import com.samhanair.logis.groupware.service.ApprovalAttachmentService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.io.IOException;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
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
 * 그룹웨어 결재 첨부 endpoint.
 *
 * <p>첨부 조회/다운로드는 {@code groupware.approvals} VIEW, 추가/삭제는 UPDATE 권한을 요구한다.
 */
@RestController
@RequestMapping("/admin/groupware/approvals/{approvalId}/attachments")
@RequiredArgsConstructor
public class GroupwareApprovalAttachmentController {

    private static final String PAGE_CODE = "groupware.approvals";

    private final ApprovalAttachmentService approvalAttachmentService;

    /** 결재 첨부 목록 조회. */
    @Operation(summary = "결재 첨부 목록 조회")
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalAttachmentResponse>> list(@PathVariable UUID approvalId) {
        return ApiResponse.ok(approvalAttachmentService.list(approvalId).stream()
                .map(ApprovalAttachmentResponse::from)
                .toList());
    }

    /** 전표/거래처원장 참조 첨부 추가. */
    @Operation(summary = "결재 참조 첨부 추가")
    @PostMapping
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ResponseEntity<ApiResponse<ApprovalAttachmentResponse>> addReference(
            @PathVariable UUID approvalId,
            @Valid @RequestBody ApprovalAttachmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ApprovalAttachmentResponse.from(
                        approvalAttachmentService.addReference(approvalId, request))));
    }

    /** 파일 첨부 업로드. */
    @Operation(summary = "결재 파일 첨부 업로드")
    @PostMapping(value = "/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ResponseEntity<ApiResponse<ApprovalAttachmentResponse>> uploadFile(
            @PathVariable UUID approvalId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "label", required = false) String label,
            @RequestParam(value = "displayOrder", defaultValue = "0") int displayOrder) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ApprovalAttachmentResponse.from(
                        approvalAttachmentService.uploadFile(approvalId, file, label, displayOrder))));
    }

    /** 파일 첨부 다운로드. */
    @Operation(summary = "결재 파일 첨부 다운로드")
    @GetMapping("/{attachmentId}/download")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ResponseEntity<InputStreamResource> download(@PathVariable UUID approvalId,
                                                        @PathVariable UUID attachmentId) throws IOException {
        ApprovalAttachmentService.DownloadView view =
                approvalAttachmentService.download(approvalId, attachmentId);
        String contentType = view.attachment().getContentType() == null
                ? view.storedObject().contentType()
                : view.attachment().getContentType();
        InputStreamResource resource = new InputStreamResource(view.storedObject().data());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        // 한글/공백 파일명 RFC 5987 인코딩 — UTF-8 미지정 시 헤더 깨짐.
                        .filename(view.attachment().getFileName(), java.nio.charset.StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .body(resource);
    }

    /** 첨부 soft-delete. */
    @Operation(summary = "결재 첨부 삭제")
    @DeleteMapping("/{attachmentId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> delete(@PathVariable UUID approvalId,
                                    @PathVariable UUID attachmentId,
                                    Principal principal) {
        approvalAttachmentService.delete(approvalId, attachmentId,
                principal == null ? "system" : principal.getName());
        return ApiResponse.ok(null);
    }
}
