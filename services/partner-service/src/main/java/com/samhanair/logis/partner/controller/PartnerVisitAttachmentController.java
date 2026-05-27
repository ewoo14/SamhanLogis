package com.samhanair.logis.partner.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.AttachmentType;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerAttachment;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.service.PartnerAttachmentService;
import com.samhanair.logis.partner.web.dto.PartnerAttachmentResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 영업 방문 사진 첨부 REST endpoint — P1 (영업 방문 사진 첨부).
 *
 * <p>매뉴얼 출처: {@code docs/manual/04-모바일/04-사진-첨부.md} §영업 방문 사진 첨부.
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — path variable 은 partnerCode
 * (비즈니스 식별자) 만 사용. 응답의 UUID 는 후속 delete endpoint 의 path variable 로만 활용.
 *
 * <p>첨부 유형은 {@link AttachmentType#VISIT_PHOTO} 로 강제 (별도 type 파라미터 불필요).
 * 기존 {@link com.samhanair.logis.partner.web.PartnerAttachmentController} 의 일반 첨부와 분리.
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>업로드 — SALES / MANAGER / MASTER</li>
 *   <li>조회 (목록 / 상세) — 모든 인증 사용자</li>
 *   <li>삭제 — MANAGER / MASTER (본인 가드 후속 슬라이스에서 강화)</li>
 * </ul>
 *
 * <p>파일 제한: ≤ 10MB, image/jpeg · image/png (방문 사진은 이미지만 허용).
 */
@RestController
@RequestMapping("/admin/partners/{partnerCode}/visit-attachments")
@RequiredArgsConstructor
public class PartnerVisitAttachmentController {

    private final PartnerRepository partnerRepository;
    private final PartnerAttachmentService attachmentService;

    /**
     * 영업 방문 사진 업로드 (multipart/form-data).
     *
     * <p>첨부 유형은 {@link AttachmentType#VISIT_PHOTO} 로 강제.
     * partnerCode 로 거래처를 조회한 뒤 UUID 를 내부에서 resolve (UUID 비공개 가드).
     *
     * <p>form 필드:
     * <ul>
     *   <li>{@code file} — multipart 파일 (≤10MB, image/jpeg / image/png)</li>
     *   <li>{@code description} — 비고 (선택 — 방문 목적 / 미팅 요약 등)</li>
     * </ul>
     *
     * @param partnerCode 거래처코드 (비즈니스 식별자, UUID 비공개)
     * @param file        multipart 사진 파일
     * @param description 비고 (선택)
     * @param principal   Spring Security Principal (X-User-Id 헤더 → UUID)
     * @return 201 + PartnerAttachmentResponse
     */
    @Operation(summary = "영업 방문 사진 업로드",
            description = "SALES/MANAGER/MASTER 권한. partnerCode 기반 (UUID 비공개). "
                    + "첨부 유형 VISIT_PHOTO 강제. ≤10MB, image/jpeg·png 만 허용")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "업로드 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 크기/형식 미허용"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미존재")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "partners.detail", action = "EDIT")
    public ApiResponse<PartnerAttachmentResponse> upload(
            @PathVariable String partnerCode,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "description", required = false) String description,
            Principal principal) {

        // partnerCode → partnerId resolve (UUID 비공개 가드)
        Partner partner = partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerCode));

        // 방문 사진은 image/* 만 허용 — service 레이어의 ALLOWED_MIME_TYPES 에 추가로 PDF 차단
        validateVisitPhotoMime(file);

        UUID uploaderId = resolveUserUuid(principal);
        PartnerAttachment saved = attachmentService.upload(
                partner.getId(), AttachmentType.VISIT_PHOTO, file, description, uploaderId);

        return ApiResponse.ok(PartnerAttachmentResponse.from(saved, saved.getStorageUrl()));
    }

    /**
     * 거래처별 영업 방문 사진 목록 (VISIT_PHOTO 유형만).
     *
     * @param partnerCode 거래처코드 (비즈니스 식별자)
     * @return VISIT_PHOTO 유형 첨부 목록 (downloadUrl 는 캐시 — 만료 가능)
     */
    @Operation(summary = "영업 방문 사진 목록 조회",
            description = "VISIT_PHOTO 유형만 반환. downloadUrl 는 캐시(만료 가능) — 단건 GET 으로 재발급")
    @GetMapping
    @RequirePermission(page = "partners.detail", action = "VIEW")
    public ApiResponse<List<PartnerAttachmentResponse>> list(@PathVariable String partnerCode) {
        Partner partner = partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerCode));

        List<PartnerAttachmentResponse> items =
                attachmentService.listByType(partner.getId(), AttachmentType.VISIT_PHOTO).stream()
                        .map(PartnerAttachmentResponse::from)
                        .toList();
        return ApiResponse.ok(items);
    }

    /**
     * 방문 사진 단건 + presigned downloadUrl (1시간 유효) 발급.
     *
     * @param partnerCode  거래처코드 (path 일관성용, 실제 조회는 attachmentId 기반)
     * @param attachmentId PartnerAttachment UUID
     * @return 단건 응답 (freshUrl 포함)
     */
    @Operation(summary = "방문 사진 단건 + presigned 다운로드 URL 발급",
            description = "downloadUrl 은 1시간 유효 — 만료 시 본 endpoint 재호출")
    @GetMapping("/{attachmentId}")
    @RequirePermission(page = "partners.detail", action = "VIEW")
    public ApiResponse<PartnerAttachmentResponse> detail(
            @PathVariable String partnerCode,
            @PathVariable UUID attachmentId) {
        PartnerAttachmentService.DownloadView view = attachmentService.download(attachmentId);
        return ApiResponse.ok(
                PartnerAttachmentResponse.from(view.attachment(), view.downloadUrl()));
    }

    /**
     * 방문 사진 soft-delete (MinIO 객체는 보존).
     *
     * @param partnerCode  거래처코드 (path 일관성용)
     * @param attachmentId PartnerAttachment UUID
     * @param principal    Spring Security Principal (삭제 수행자)
     * @return 200
     */
    @Operation(summary = "방문 사진 soft-delete",
            description = "MANAGER/MASTER 권한. MinIO 객체는 감사 추적 위해 보존")
    @DeleteMapping("/{attachmentId}")
    @RequirePermission(page = "partners.edit", action = "EDIT")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String partnerCode,
            @PathVariable UUID attachmentId,
            Principal principal) {
        UUID deleter = resolveUserUuid(principal);
        attachmentService.delete(attachmentId, deleter);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    /**
     * 방문 사진 전용 MIME 검증 — image/* 만 허용 (PDF 제외).
     * service 레이어 allowlist 가 PDF 포함이므로 controller 에서 추가 차단.
     */
    private void validateVisitPhotoMime(MultipartFile file) {
        String mime = file == null ? null : file.getContentType();
        if (mime == null || !mime.toLowerCase().startsWith("image/")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "방문 사진은 이미지 파일만 허용됩니다 (image/jpeg, image/png). 현재: " + mime);
        }
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
