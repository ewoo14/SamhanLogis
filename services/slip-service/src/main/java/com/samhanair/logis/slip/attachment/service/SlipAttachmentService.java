package com.samhanair.logis.slip.attachment.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.repository.SlipAttachmentRepository;
import com.samhanair.logis.slip.attachment.storage.SlipAttachmentStorage;
import com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 슬립 첨부 파일 라이프사이클 — P1-8 (Stage 4) 모바일 사진 첨부.
 *
 * <p>책임 경계 (partner-service PartnerAttachmentService 패턴 일관):
 * <ul>
 *   <li>실 파일 = MinIO ({@link SlipAttachmentStorage}) — service 가 storageKey 발급 후 upload</li>
 *   <li>metadata = PostgreSQL ({@link SlipAttachment}) — DB INSERT</li>
 *   <li>presigned URL = service 가 download 시점에 storageKey 로 재발급 (1시간 유효)</li>
 *   <li>delete = soft-delete + MinIO 객체 보존 (감사 추적)</li>
 * </ul>
 *
 * <p>가드 (매뉴얼 §4.3):
 * <ul>
 *   <li>파일 크기 ≤ 5MB (배송 사진 자동 압축 후 권장 크기)</li>
 *   <li>MIME ∈ { image/jpeg, image/png, application/pdf }</li>
 *   <li>slipId 미존재 → 404 NOT_FOUND</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class SlipAttachmentService {

    /** 단일 파일 최대 크기 (5MB). 매뉴얼 §4.3 권장. */
    public static final long MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;

    /** 허용 MIME 화이트리스트 (매뉴얼 §4.3). */
    public static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/jpg",
            "image/png",
            "application/pdf"
    );

    private static final String STORAGE_KEY_PREFIX = "slip-attachments";

    private final SlipRepository slipRepository;
    private final SlipAttachmentRepository attachmentRepository;
    private final SlipAttachmentStorage storage;

    /**
     * 첨부 업로드. slip 존재 확인 → MinIO 업로드 → DB INSERT.
     *
     * @param slipId 소속 Slip UUID
     * @param attachmentType 첨부 유형
     * @param file multipart 파일
     * @param exifGpsLat EXIF GPS 위도 (선택)
     * @param exifGpsLng EXIF GPS 경도 (선택)
     * @param capturedAt EXIF 촬영 시각 (선택)
     * @param uploaderId 업로더 user-id
     * @return 영속화된 SlipAttachment (presigned URL 캐시 포함)
     */
    @Transactional
    public SlipAttachment upload(UUID slipId, SlipAttachmentType attachmentType,
                                 MultipartFile file,
                                 BigDecimal exifGpsLat, BigDecimal exifGpsLng,
                                 LocalDateTime capturedAt, String uploaderId) {
        validateFile(file);
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다: " + slipId));

        String fileName = sanitizeFileName(file.getOriginalFilename());
        String storageKey = buildStorageKey(slip.getId(), fileName);

        // storage 업로드 (예외 시 DB INSERT 미수행 — 트랜잭션 rollback)
        try (InputStream in = file.getInputStream()) {
            storage.upload(storageKey, file.getContentType(), file.getSize(), in);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "첨부 파일 업로드 실패: " + ex.getMessage());
        }

        SlipAttachment attachment = SlipAttachment.register(
                slip.getId(),
                attachmentType,
                fileName,
                file.getSize(),
                file.getContentType(),
                storageKey,
                exifGpsLat,
                exifGpsLng,
                capturedAt,
                uploaderId);

        // 캐시 URL 즉시 발급 (1시간 — 화면 즉시 미리보기 용)
        attachment.refreshStorageUrl(storage.presignedGetUrl(storageKey));
        return attachmentRepository.save(attachment);
    }

    /** 슬립별 첨부 목록 — soft-deleted 자동 제외. */
    @Transactional(readOnly = true)
    public List<SlipAttachment> list(UUID slipId) {
        return attachmentRepository.findBySlipIdAndIsDeletedFalseOrderByUploadedAtAsc(slipId);
    }

    /**
     * 슬립 + 첨부 유형 조합 목록 — 배송 사진(DELIVERY) 전용 조회 등에 사용.
     *
     * @param slipId         대상 Slip UUID
     * @param attachmentType 첨부 유형 필터
     * @return 해당 유형의 첨부 목록 (업로드 시각 오름차순)
     */
    @Transactional(readOnly = true)
    public List<SlipAttachment> listByType(UUID slipId, SlipAttachmentType attachmentType) {
        return attachmentRepository
                .findBySlipIdAndAttachmentTypeAndIsDeletedFalseOrderByUploadedAtAsc(
                        slipId, attachmentType);
    }

    /**
     * 관리자 사진 감사 목록 조회.
     *
     * <p>기존 {@code slip_attachments} 와 {@code slips} 만 조인해 조회하며 신규 감사 테이블은 만들지 않는다.
     * 내부 {@code attachmentId} 와 {@code slipId} 는 응답에 포함하지 않는다.
     *
     * @param type 첨부 유형 필터, null 이면 전체
     * @param from 전표일자 시작, null 이면 하한 없음
     * @param to 전표일자 종료, null 이면 상한 없음
     * @param slipNo 전표번호 부분 검색어, blank 면 전체
     * @param pageable 페이지 요청. 호출자는 uploadedAt desc 정렬을 지정한다
     * @return 관리자 사진 감사 응답 페이지
     */
    @Transactional(readOnly = true)
    public Page<SlipPhotoAuditResponse> listPhotoAudit(
            SlipAttachmentType type,
            LocalDate from,
            LocalDate to,
            String slipNo,
            Pageable pageable) {
        String normalizedSlipNo = normalizeContainsFilter(slipNo);
        return attachmentRepository.findPhotoAudit(type, from, to, normalizedSlipNo, pageable);
    }

    /**
     * 다운로드 — presigned URL 신규 발급 + DB 캐시 갱신.
     */
    @Transactional
    public DownloadView download(UUID attachmentId) {
        SlipAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "첨부 파일을 찾을 수 없습니다: " + attachmentId));
        String url = storage.presignedGetUrl(attachment.getStorageKey());
        attachment.refreshStorageUrl(url);
        return new DownloadView(attachment, url);
    }

    /**
     * Soft-delete. MinIO 객체는 보존 (감사 추적).
     */
    @Transactional
    public void delete(UUID attachmentId, String deleterUserId) {
        SlipAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "첨부 파일을 찾을 수 없습니다: " + attachmentId));
        attachment.softDelete(deleterUserId == null || deleterUserId.isBlank()
                ? "system" : deleterUserId);
    }

    /** download() 응답 view. */
    public record DownloadView(SlipAttachment attachment, String downloadUrl) { }

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

    private String normalizeContainsFilter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return escapeLikeLiteral(value.trim());
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private String buildStorageKey(UUID slipId, String fileName) {
        String ext = extractExtension(fileName);
        return STORAGE_KEY_PREFIX + "/" + slipId + "/" + UUID.randomUUID() + ext;
    }

    private String extractExtension(String fileName) {
        int idx = fileName.lastIndexOf('.');
        if (idx < 0 || idx == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(idx).toLowerCase();
    }
}
