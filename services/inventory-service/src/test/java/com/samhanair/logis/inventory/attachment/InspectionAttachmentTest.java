package com.samhanair.logis.inventory.attachment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * InspectionAttachment 도메인 단위 테스트 — P1 검수 사진 첨부 시나리오 4종:
 * <ol>
 *   <li>register factory — 전체 메타데이터 + EXIF GPS 보존</li>
 *   <li>register factory — EXIF GPS / capturedAt null 허용</li>
 *   <li>softDelete — BaseEntity.markDeleted 위임</li>
 *   <li>register factory — 필수값 누락 시 IllegalArgumentException</li>
 * </ol>
 */
class InspectionAttachmentTest {

    private static final UUID INSPECTION = UUID.randomUUID();
    private static final String SLIP_NO   = "2026/01/10-001";

    @Test
    @DisplayName("register — 전체 메타데이터(EXIF GPS + capturedAt 포함) 정상 보존")
    void register_allMetadata_preserved() {
        BigDecimal lat      = new BigDecimal("37.5172000");
        BigDecimal lng      = new BigDecimal("127.0473000");
        LocalDateTime captured = LocalDateTime.of(2026, 5, 9, 14, 30);

        InspectionAttachment a = InspectionAttachment.register(
                INSPECTION, SLIP_NO,
                "defect_2026-05-09.jpg", 2048L, "image/jpeg",
                "inspection-attachments/" + INSPECTION + "/abc.jpg",
                lat, lng, captured, "warehouse-1",
                "불량 상품 사진");

        assertThat(a.getInspectionId()).isEqualTo(INSPECTION);
        assertThat(a.getSlipNo()).isEqualTo(SLIP_NO);
        assertThat(a.getFileName()).isEqualTo("defect_2026-05-09.jpg");
        assertThat(a.getFileSize()).isEqualTo(2048L);
        assertThat(a.getContentType()).isEqualTo("image/jpeg");
        assertThat(a.getExifGpsLat()).isEqualByComparingTo("37.5172000");
        assertThat(a.getExifGpsLng()).isEqualByComparingTo("127.0473000");
        assertThat(a.getCapturedAt()).isEqualTo(captured);
        assertThat(a.getUploadedBy()).isEqualTo("warehouse-1");
        assertThat(a.getDescription()).isEqualTo("불량 상품 사진");
        assertThat(a.getUploadedAt()).isNotNull();
        assertThat(a.getStorageUrl()).isNull(); // refreshStorageUrl 호출 전
    }

    @Test
    @DisplayName("register — EXIF GPS / capturedAt null 허용 (선택 필드)")
    void register_nullOptionalFields_allowed() {
        InspectionAttachment a = InspectionAttachment.register(
                INSPECTION, SLIP_NO,
                "inspect.png", 1024L, "image/png",
                "inspection-attachments/" + INSPECTION + "/x.png",
                null, null, null, "warehouse-2", null);

        assertThat(a.getExifGpsLat()).isNull();
        assertThat(a.getExifGpsLng()).isNull();
        assertThat(a.getCapturedAt()).isNull();
        assertThat(a.getDescription()).isNull();
    }

    @Test
    @DisplayName("softDelete — isDeleted=true, deletedBy 기록")
    void softDelete_marksDeletedFlag() {
        InspectionAttachment a = InspectionAttachment.register(
                INSPECTION, SLIP_NO,
                "inspect.jpg", 512L, "image/jpeg",
                "inspection-attachments/" + INSPECTION + "/y.jpg",
                null, null, null, "warehouse-1", null);

        a.softDelete("manager-1");

        assertThat(a.getIsDeleted()).isTrue();
        assertThat(a.getDeletedBy()).isEqualTo("manager-1");
        assertThat(a.getDeletedAt()).isNotNull();
    }

    @Test
    @DisplayName("refreshStorageUrl — URL 캐시 정상 갱신")
    void refreshStorageUrl_updatesUrl() {
        InspectionAttachment a = InspectionAttachment.register(
                INSPECTION, SLIP_NO,
                "f.jpg", 1L, "image/jpeg",
                "k", null, null, null, "u", null);

        assertThat(a.getStorageUrl()).isNull();
        a.refreshStorageUrl("https://minio/presigned/url");
        assertThat(a.getStorageUrl()).isEqualTo("https://minio/presigned/url");
    }

    @Test
    @DisplayName("register — 필수값 누락 시 IllegalArgumentException")
    void register_invalidParams_throws() {
        // inspectionId null
        assertThatThrownBy(() -> InspectionAttachment.register(
                null, SLIP_NO, "f.jpg", 1L, "image/jpeg", "k", null, null, null, "u", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("inspectionId");

        // slipNo blank
        assertThatThrownBy(() -> InspectionAttachment.register(
                INSPECTION, "", "f.jpg", 1L, "image/jpeg", "k", null, null, null, "u", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("slipNo");

        // fileName blank
        assertThatThrownBy(() -> InspectionAttachment.register(
                INSPECTION, SLIP_NO, "  ", 1L, "image/jpeg", "k", null, null, null, "u", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fileName");

        // fileSize 음수
        assertThatThrownBy(() -> InspectionAttachment.register(
                INSPECTION, SLIP_NO, "f.jpg", -1L, "image/jpeg", "k", null, null, null, "u", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fileSize");

        // uploadedBy blank
        assertThatThrownBy(() -> InspectionAttachment.register(
                INSPECTION, SLIP_NO, "f.jpg", 1L, "image/jpeg", "k", null, null, null, "", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("uploadedBy");
    }
}
