package com.samhanair.logis.inventory.attachment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import com.samhanair.logis.inventory.attachment.repository.InspectionAttachmentRepository;
import com.samhanair.logis.inventory.attachment.service.InspectionAttachmentService;
import com.samhanair.logis.inventory.attachment.storage.InspectionAttachmentStorage;
import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

/**
 * InspectionAttachmentService 단위 테스트 — P1 검수 사진 첨부 시나리오 4종:
 * <ol>
 *   <li>upload 정상 — MinIO upload + DB save + presigned URL 캐시</li>
 *   <li>upload — 파일 크기 초과 → BusinessException(INVALID_INPUT)</li>
 *   <li>upload — 허용되지 않은 MIME → BusinessException(INVALID_INPUT)</li>
 *   <li>upload — inspectionId 미존재 → BusinessException(NOT_FOUND)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class InspectionAttachmentServiceTest {

    @Mock InboundInspectionRepository inspectionRepository;
    @Mock InspectionAttachmentRepository attachmentRepository;
    @Mock InspectionAttachmentStorage storage;

    @InjectMocks InspectionAttachmentService service;

    @Test
    @DisplayName("upload — 정상 흐름: MinIO upload + DB save + presigned URL 반환")
    void upload_happyPath_returnsAttachment() {
        // given
        UUID inspectionId = UUID.randomUUID();
        InboundInspection inspection = InboundInspection.create(inspectionId, "2026/01/10-001");

        given(inspectionRepository.findById(inspectionId)).willReturn(Optional.of(inspection));
        given(storage.presignedGetUrl(anyString())).willReturn("https://minio/presigned");
        given(attachmentRepository.save(any())).willAnswer(inv -> inv.getArgument(0));

        MockMultipartFile file = new MockMultipartFile(
                "file", "defect.jpg", "image/jpeg", "fake-jpeg".getBytes());

        // when
        InspectionAttachment result = service.upload(inspectionId, file,
                null, null, null, "warehouse-1", "불량 상품");

        // then
        assertThat(result.getInspectionId()).isEqualTo(inspection.getId());
        assertThat(result.getFileName()).isEqualTo("defect.jpg");
        assertThat(result.getStorageUrl()).isEqualTo("https://minio/presigned");
        assertThat(result.getUploadedBy()).isEqualTo("warehouse-1");
        assertThat(result.getDescription()).isEqualTo("불량 상품");
        verify(storage).upload(anyString(), anyString(), anyLong(), any());
        verify(attachmentRepository).save(any());
    }

    @Test
    @DisplayName("upload — 파일 크기 5MB 초과 → INVALID_INPUT")
    void upload_fileTooLarge_throws() {
        UUID inspectionId = UUID.randomUUID();
        byte[] oversized = new byte[(int) InspectionAttachmentService.MAX_FILE_SIZE_BYTES + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.jpg", "image/jpeg", oversized);

        assertThatThrownBy(() -> service.upload(inspectionId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("5MB");
    }

    @Test
    @DisplayName("upload — application/pdf MIME → INVALID_INPUT (검수 사진은 이미지만)")
    void upload_pdfMime_throws() {
        UUID inspectionId = UUID.randomUUID();
        MockMultipartFile file = new MockMultipartFile(
                "file", "doc.pdf", "application/pdf", "pdf".getBytes());

        assertThatThrownBy(() -> service.upload(inspectionId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("허용되지 않은 파일 형식");
    }

    @Test
    @DisplayName("upload — inspectionId 미존재 → NOT_FOUND")
    void upload_inspectionNotFound_throws() {
        UUID inspectionId = UUID.randomUUID();
        given(inspectionRepository.findById(inspectionId)).willReturn(Optional.empty());

        MockMultipartFile file = new MockMultipartFile(
                "file", "f.jpg", "image/jpeg", "x".getBytes());

        assertThatThrownBy(() -> service.upload(inspectionId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("검수 레코드를 찾을 수 없습니다");
    }
}
