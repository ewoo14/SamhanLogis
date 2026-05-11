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
 *   <li>upload — slipId 에 매칭되는 검수 레코드 미존재 → BusinessException(NOT_FOUND)</li>
 * </ol>
 *
 * <p>PR #147 fix 사항:
 * <ul>
 *   <li>service signature {@code inspectionId} → {@code slipId} 변경에 따라 mock 을
 *       {@code findBySlipIdAndIsDeletedFalse} 로 업데이트.</li>
 *   <li>{@code InboundInspection.create()} 내부에서 {@code UUID.randomUUID()} 로 id 를 미리 할당하므로
 *       단위 테스트에서 {@code inspection.getId()} 가 non-null 임을 검증 가능.</li>
 * </ul>
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
        UUID slipId = UUID.randomUUID();
        InboundInspection inspection = InboundInspection.create(slipId, "2026/01/10-001");

        given(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                .willReturn(Optional.of(inspection));
        given(storage.presignedGetUrl(anyString())).willReturn("https://minio/presigned");
        given(attachmentRepository.save(any())).willAnswer(inv -> inv.getArgument(0));

        MockMultipartFile file = new MockMultipartFile(
                "file", "defect.jpg", "image/jpeg", "fake-jpeg".getBytes());

        // when
        InspectionAttachment result = service.upload(slipId, file,
                null, null, null, "warehouse-1", "불량 상품");

        // then — InboundInspection.create() 가 id 를 UUID.randomUUID() 로 미리 할당하므로
        // inspection.getId() 는 영속화 없이도 non-null. InspectionAttachment.inspectionId 검증 가능.
        assertThat(result.getInspectionId()).isEqualTo(inspection.getId());
        assertThat(result.getSlipNo()).isEqualTo("2026/01/10-001");
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
        UUID slipId = UUID.randomUUID();
        byte[] oversized = new byte[(int) InspectionAttachmentService.MAX_FILE_SIZE_BYTES + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.jpg", "image/jpeg", oversized);

        assertThatThrownBy(() -> service.upload(slipId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("5MB");
    }

    @Test
    @DisplayName("upload — application/pdf MIME → INVALID_INPUT (검수 사진은 이미지만)")
    void upload_pdfMime_throws() {
        UUID slipId = UUID.randomUUID();
        MockMultipartFile file = new MockMultipartFile(
                "file", "doc.pdf", "application/pdf", "pdf".getBytes());

        assertThatThrownBy(() -> service.upload(slipId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("허용되지 않은 파일 형식");
    }

    @Test
    @DisplayName("upload — slipId 에 매칭되는 검수 레코드 미존재 → NOT_FOUND")
    void upload_inspectionNotFound_throws() {
        UUID slipId = UUID.randomUUID();
        given(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                .willReturn(Optional.empty());

        MockMultipartFile file = new MockMultipartFile(
                "file", "f.jpg", "image/jpeg", "x".getBytes());

        assertThatThrownBy(() -> service.upload(slipId, file,
                null, null, null, "warehouse-1", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("검수 레코드를 찾을 수 없습니다");
    }
}
