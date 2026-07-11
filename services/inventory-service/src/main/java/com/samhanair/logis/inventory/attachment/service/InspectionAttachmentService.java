package com.samhanair.logis.inventory.attachment.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import com.samhanair.logis.inventory.attachment.repository.InspectionAttachmentRepository;
import com.samhanair.logis.inventory.attachment.storage.InspectionAttachmentStorage;
import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 입고 검수 사진 첨부 라이프사이클 — P1 (검수 사진 첨부).
 *
 * <p>책임 경계 (slip-service SlipAttachmentService 패턴 일관):
 * <ul>
 *   <li>실 파일 = MinIO ({@link InspectionAttachmentStorage}) — storageKey 발급 후 upload</li>
 *   <li>metadata = PostgreSQL ({@link InspectionAttachment}) — DB INSERT</li>
 *   <li>presigned URL = download 시점에 storageKey 로 재발급 (1시간 유효)</li>
 *   <li>delete = soft-delete + MinIO 객체 보존 (감사 추적)</li>
 * </ul>
 *
 * <p>가드 (매뉴얼 §04-사진-첨부.md):
 * <ul>
 *   <li>파일 크기 ≤ 5MB</li>
 *   <li>MIME ∈ { image/jpeg, image/png } (검수 사진은 이미지만 허용 — PDF 제외)</li>
 *   <li>slipId 에 매칭되는 InboundInspection 미존재 → 404 NOT_FOUND</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class InspectionAttachmentService {

    /** 단일 파일 최대 크기 (5MB). 모바일 촬영 압축 후 권장 크기. */
    public static final long MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;

    /** 허용 MIME 화이트리스트 (검수 사진은 이미지만 — PDF 제외). */
    public static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/jpg",
            "image/png"
    );

    private static final String STORAGE_KEY_PREFIX = "inspection-attachments";

    private final InboundInspectionRepository inspectionRepository;
    private final InspectionAttachmentRepository attachmentRepository;
    private final InspectionAttachmentStorage storage;

    /**
     * 검수 사진 업로드. slipId → InboundInspection lookup → MinIO 업로드 → DB INSERT.
     *
     * <p>경로 변수 {@code slipId} 는 slip-service Slip UUID. P0-9 검수 dialog 진입 시 자동
     * 생성되는 InboundInspection 의 logical reference. 검수 레코드가 없으면 404.
     *
     * @param slipId       slip-service Slip UUID (path variable)
     * @param file         multipart 파일 (≤5MB, image/*)
     * @param exifGpsLat   EXIF GPS 위도 (선택)
     * @param exifGpsLng   EXIF GPS 경도 (선택)
     * @param capturedAt   EXIF 촬영 시각 (선택)
     * @param uploaderId   업로더 user-id (gateway X-User-Id)
     * @param description  비고 (선택 — 불량 내용 등)
     * @return 영속화된 InspectionAttachment (presigned URL 캐시 포함)
     * @throws BusinessException(NOT_FOUND)    검수 레코드 미존재
     * @throws BusinessException(INVALID_INPUT) 파일 크기/형식 위반
     * @throws BusinessException(INTERNAL_ERROR) MinIO 업로드 실패
     */
    @Transactional
    public InspectionAttachment upload(UUID slipId, MultipartFile file,
                                       BigDecimal exifGpsLat, BigDecimal exifGpsLng,
                                       LocalDateTime capturedAt, String uploaderId,
                                       String description) {
        validateFile(file);

        InboundInspection inspection = inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "검수 레코드를 찾을 수 없습니다. 먼저 검수 dialog 로 진입해주세요."));

        String fileName = sanitizeFileName(file.getOriginalFilename());
        String storageKey = buildStorageKey(inspection.getId(), fileName);

        try (InputStream in = file.getInputStream()) {
            storage.upload(storageKey, file.getContentType(), file.getSize(), in);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "검수 사진 업로드 실패: " + ex.getMessage());
        }

        InspectionAttachment attachment = InspectionAttachment.register(
                inspection.getId(),
                inspection.getSlipNo() != null ? inspection.getSlipNo() : slipId.toString(),
                fileName,
                file.getSize(),
                file.getContentType(),
                storageKey,
                exifGpsLat,
                exifGpsLng,
                capturedAt,
                uploaderId,
                description);

        attachment.refreshStorageUrl(storage.presignedGetUrl(storageKey));
        return attachmentRepository.save(attachment);
    }

    /**
     * 슬립 ID 기준 첨부 목록 — soft-deleted 자동 제외.
     *
     * @param slipId slip-service Slip UUID
     * @return 업로드 시각 오름차순 목록 (검수 레코드 미존재 시 빈 목록)
     */
    @Transactional(readOnly = true)
    public List<InspectionAttachment> listBySlipId(UUID slipId) {
        return inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId)
                .map(insp -> attachmentRepository.findByInspectionIdOrderByUploadedAtAsc(insp.getId()))
                .orElseGet(List::of);
    }

    /**
     * 슬립번호 기준 첨부 목록 (UUID 비공개 우회 — slipNo 로 조회).
     *
     * @param slipNo 슬립번호 snapshot
     * @return 업로드 시각 오름차순 목록
     */
    @Transactional(readOnly = true)
    public List<InspectionAttachment> listBySlipNo(String slipNo) {
        return attachmentRepository.findBySlipNoOrderByUploadedAtAsc(slipNo);
    }

    /**
     * 단건 조회 + presigned URL 신규 발급.
     *
     * @param attachmentId InspectionAttachment UUID
     * @return (attachment, freshUrl) 튜플
     * @throws BusinessException(NOT_FOUND) 첨부 미존재
     */
    @Transactional
    public DownloadView download(UUID attachmentId) {
        InspectionAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "검수 첨부 파일을 찾을 수 없습니다: " + attachmentId));
        String url = storage.presignedGetUrl(attachment.getStorageKey());
        attachment.refreshStorageUrl(url);
        return new DownloadView(attachment, url);
    }

    /**
     * Soft-delete. MinIO 객체는 보존 (감사 추적).
     *
     * @param attachmentId InspectionAttachment UUID
     * @param deleterUserId 삭제 수행자 user-id
     * @throws BusinessException(NOT_FOUND) 첨부 미존재
     */
    @Transactional
    public void delete(UUID attachmentId, String deleterUserId) {
        InspectionAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "검수 첨부 파일을 찾을 수 없습니다: " + attachmentId));
        attachment.softDelete(deleterUserId == null || deleterUserId.isBlank()
                ? "system" : deleterUserId);
    }

    /** download() 응답 view. */
    public record DownloadView(InspectionAttachment attachment, String downloadUrl) { }

    // ============================================================
    // helpers
    // ============================================================

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일이 비어 있습니다");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기는 최대 5MB 까지 허용됩니다 (현재: " + file.getSize() + " bytes)");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "허용되지 않은 파일 형식입니다. 허용: " + ALLOWED_CONTENT_TYPES
                            + " (현재: " + contentType + ")");
        }
    }

    private String sanitizeFileName(String original) {
        if (original == null || original.isBlank()) {
            return "untitled";
        }
        return original.replace("/", "_").replace("\\", "_");
    }

    private String buildStorageKey(UUID inspectionId, String fileName) {
        String ext = extractExtension(fileName);
        return STORAGE_KEY_PREFIX + "/" + inspectionId + "/" + UUID.randomUUID() + ext;
    }

    private String extractExtension(String fileName) {
        int idx = fileName.lastIndexOf('.');
        if (idx < 0 || idx == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(idx).toLowerCase();
    }
}
