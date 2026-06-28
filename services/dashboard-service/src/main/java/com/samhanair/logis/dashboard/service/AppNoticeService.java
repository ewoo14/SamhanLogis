package com.samhanair.logis.dashboard.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dashboard.domain.AppNotice;
import com.samhanair.logis.dashboard.domain.AppNoticeImage;
import com.samhanair.logis.dashboard.dto.AppNoticeAdminImageResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeAdminResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeImageOrderRequest;
import com.samhanair.logis.dashboard.dto.AppNoticeImageResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeRequest;
import com.samhanair.logis.dashboard.dto.AppNoticeResponse;
import com.samhanair.logis.dashboard.repository.AppNoticeImageRepository;
import com.samhanair.logis.dashboard.repository.AppNoticeRepository;
import com.samhanair.logis.dashboard.storage.AppNoticeImageStorage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** 팝업공지 관리 및 활성공지 조회 서비스. */
@Service
@RequiredArgsConstructor
public class AppNoticeService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final String STORAGE_KEY_PREFIX = "app-notices";
    private static final long MAX_IMAGE_SIZE_BYTES = 5L * 1024 * 1024;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif");

    private final AppNoticeRepository noticeRepository;
    private final AppNoticeImageRepository imageRepository;
    private final AppNoticeImageStorage storage;

    /** 현재 KST 기준 활성 공지 목록. */
    @Transactional(readOnly = true)
    public List<AppNoticeResponse> activeNotices() {
        LocalDateTime now = LocalDateTime.now(KST);
        List<AppNotice> notices = noticeRepository
                .findByActiveTrueAndStartAtLessThanEqualAndEndAtGreaterThanEqualOrderByDisplayOrderAscStartAtDesc(
                        now, now);
        Map<UUID, List<AppNoticeImage>> imagesByNoticeId = imagesByNoticeId(notices);
        return notices.stream()
                .map(notice -> toResponse(notice, imagesByNoticeId.getOrDefault(notice.getId(), List.of())))
                .toList();
    }

    /** 관리자 전체 목록. */
    @Transactional(readOnly = true)
    public List<AppNoticeAdminResponse> list() {
        List<AppNotice> notices = noticeRepository.findAllByOrderByDisplayOrderAscStartAtDesc();
        Map<UUID, List<AppNoticeImage>> imagesByNoticeId = imagesByNoticeId(notices);
        return notices.stream()
                .map(notice -> toAdminResponse(notice, imagesByNoticeId.getOrDefault(notice.getId(), List.of())))
                .toList();
    }

    /** 공지 등록. */
    @Transactional
    public AppNoticeAdminResponse create(AppNoticeRequest request) {
        AppNotice notice = noticeRepository.save(AppNotice.create(
                request.title(),
                request.isActive(),
                request.startAt(),
                request.endAt(),
                request.displayOrder()));
        return toAdminResponse(notice);
    }

    /** 공지 수정. */
    @Transactional
    public AppNoticeAdminResponse update(UUID id, AppNoticeRequest request) {
        AppNotice notice = findNotice(id);
        notice.update(
                request.title(),
                request.isActive(),
                request.startAt(),
                request.endAt(),
                request.displayOrder());
        return toAdminResponse(notice);
    }

    /** 공지 soft-delete. */
    @Transactional
    public void delete(UUID id, String actor) {
        AppNotice notice = findNotice(id);
        imageRepository.findByNoticeIdOrderByDisplayOrderAsc(notice.getId())
                .forEach(image -> image.softDelete(actor));
        notice.softDelete(actor);
    }

    /** 공지 이미지 업로드. */
    @Transactional
    public AppNoticeAdminImageResponse uploadImage(
            UUID noticeId,
            MultipartFile file,
            Integer displayOrder,
            String caption) {
        ValidatedImage validatedImage = validateImage(file);
        AppNotice notice = findNotice(noticeId);
        String fileName = sanitizeFileName(file.getOriginalFilename());
        String storageKey = buildStorageKey(notice.getId(), fileName);
        storage.upload(
                storageKey,
                validatedImage.contentType(),
                validatedImage.bytes().length,
                new ByteArrayInputStream(validatedImage.bytes()));
        AppNoticeImage image = imageRepository.save(AppNoticeImage.create(
                notice.getId(),
                storageKey,
                fileName,
                displayOrder == null ? nextDisplayOrder(notice.getId()) : displayOrder,
                caption));
        return toAdminImageResponse(image);
    }

    /** 이미지 순서 변경. */
    @Transactional
    public List<AppNoticeAdminImageResponse> reorderImages(UUID noticeId, List<AppNoticeImageOrderRequest> orders) {
        findNotice(noticeId);
        List<AppNoticeImage> images = imageRepository.findByNoticeIdOrderByDisplayOrderAsc(noticeId);
        for (AppNoticeImageOrderRequest order : orders) {
            AppNoticeImage image = images.stream()
                    .filter(candidate -> candidate.getId().equals(order.id()))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "공지 이미지를 찾을 수 없습니다."));
            image.reorder(order.displayOrder());
        }
        return imageRepository.findByNoticeIdOrderByDisplayOrderAsc(noticeId).stream()
                .map(this::toAdminImageResponse)
                .toList();
    }

    /** 이미지 soft-delete. */
    @Transactional
    public void deleteImage(UUID noticeId, UUID imageId, String actor) {
        findNotice(noticeId);
        AppNoticeImage image = imageRepository.findById(imageId)
                .filter(candidate -> candidate.getNoticeId().equals(noticeId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "공지 이미지를 찾을 수 없습니다."));
        image.softDelete(actor);
    }

    private Map<UUID, List<AppNoticeImage>> imagesByNoticeId(List<AppNotice> notices) {
        if (notices.isEmpty()) {
            return Collections.emptyMap();
        }
        List<UUID> noticeIds = notices.stream()
                .map(AppNotice::getId)
                .toList();
        return imageRepository.findByNoticeIdInOrderByNoticeIdAscDisplayOrderAsc(noticeIds).stream()
                .collect(Collectors.groupingBy(
                        AppNoticeImage::getNoticeId,
                        LinkedHashMap::new,
                        Collectors.toList()));
    }

    private AppNoticeResponse toResponse(AppNotice notice, List<AppNoticeImage> imageRows) {
        List<AppNoticeImageResponse> images = imageRows.stream()
                .map(this::toImageResponse)
                .toList();
        return AppNoticeResponse.from(notice, images);
    }

    private AppNoticeAdminResponse toAdminResponse(AppNotice notice) {
        return toAdminResponse(notice, imageRepository.findByNoticeIdOrderByDisplayOrderAsc(notice.getId()));
    }

    private AppNoticeAdminResponse toAdminResponse(AppNotice notice, List<AppNoticeImage> imageRows) {
        List<AppNoticeAdminImageResponse> images = imageRows.stream()
                .map(this::toAdminImageResponse)
                .toList();
        return AppNoticeAdminResponse.from(notice, images);
    }

    private AppNoticeImageResponse toImageResponse(AppNoticeImage image) {
        return AppNoticeImageResponse.from(image, storage.presignedGetUrl(image.getImageKey()));
    }

    private AppNoticeAdminImageResponse toAdminImageResponse(AppNoticeImage image) {
        return AppNoticeAdminImageResponse.from(image, storage.presignedGetUrl(image.getImageKey()));
    }

    private AppNotice findNotice(UUID id) {
        return noticeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "팝업공지를 찾을 수 없습니다."));
    }

    private int nextDisplayOrder(UUID noticeId) {
        return imageRepository.findByNoticeIdOrderByDisplayOrderAsc(noticeId).stream()
                .mapToInt(AppNoticeImage::getDisplayOrder)
                .max()
                .orElse(0) + 1;
    }

    private ValidatedImage validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미지 파일이 비어 있습니다.");
        }
        if (file.getSize() > MAX_IMAGE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미지 파일은 최대 5MB까지 허용됩니다.");
        }
        String contentType = file.getContentType();
        String normalizedContentType = contentType == null ? "" : contentType.toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.contains(normalizedContentType)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "허용되지 않은 이미지 형식입니다.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "공지 이미지 읽기 실패: " + ex.getMessage());
        }
        if (bytes.length == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미지 파일이 비어 있습니다.");
        }
        if (bytes.length > MAX_IMAGE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미지 파일은 최대 5MB까지 허용됩니다.");
        }
        ImageType detectedType = detectImageType(bytes);
        if (detectedType == null || !detectedType.matches(normalizedContentType)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "허용되지 않은 이미지 형식입니다.");
        }
        return new ValidatedImage(bytes, detectedType.storageContentType());
    }

    private String sanitizeFileName(String original) {
        if (original == null || original.isBlank()) {
            return "untitled";
        }
        String sanitized = original.replace("/", "_").replace("\\", "_").trim();
        if (sanitized.isBlank()) {
            return "untitled";
        }
        if (sanitized.length() > 255) {
            return sanitized.substring(sanitized.length() - 255);
        }
        return sanitized;
    }

    private String buildStorageKey(UUID noticeId, String fileName) {
        String ext = extractExtension(fileName);
        return STORAGE_KEY_PREFIX + "/" + noticeId + "/" + UUID.randomUUID() + ext;
    }

    private String extractExtension(String fileName) {
        int idx = fileName.lastIndexOf('.');
        if (idx < 0 || idx == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(idx).toLowerCase();
    }

    private ImageType detectImageType(byte[] bytes) {
        if (bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF) {
            return ImageType.JPEG;
        }
        if (bytes.length >= 4
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47) {
            return ImageType.PNG;
        }
        if (bytes.length >= 4
                && bytes[0] == 0x47
                && bytes[1] == 0x49
                && bytes[2] == 0x46
                && bytes[3] == 0x38) {
            return ImageType.GIF;
        }
        if (bytes.length >= 12
                && bytes[0] == 0x52
                && bytes[1] == 0x49
                && bytes[2] == 0x46
                && bytes[3] == 0x46
                && bytes[8] == 0x57
                && bytes[9] == 0x45
                && bytes[10] == 0x42
                && bytes[11] == 0x50) {
            return ImageType.WEBP;
        }
        return null;
    }

    private record ValidatedImage(byte[] bytes, String contentType) {
    }

    private enum ImageType {
        JPEG("image/jpeg", Set.of("image/jpeg", "image/jpg")),
        PNG("image/png", Set.of("image/png")),
        GIF("image/gif", Set.of("image/gif")),
        WEBP("image/webp", Set.of("image/webp"));

        private final String storageContentType;
        private final Set<String> contentTypes;

        ImageType(String storageContentType, Set<String> contentTypes) {
            this.storageContentType = storageContentType;
            this.contentTypes = contentTypes;
        }

        private boolean matches(String contentType) {
            return contentTypes.contains(contentType);
        }

        private String storageContentType() {
            return storageContentType;
        }
    }
}
