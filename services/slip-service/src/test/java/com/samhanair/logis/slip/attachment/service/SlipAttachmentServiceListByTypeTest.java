package com.samhanair.logis.slip.attachment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.repository.SlipAttachmentRepository;
import com.samhanair.logis.slip.attachment.storage.SlipAttachmentStorage;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.PageImpl;

/**
 * SlipAttachmentService.listByType 단위 테스트 — P1 배송 완료 사진 첨부.
 *
 * <p>배송 사진 전용 endpoint ({@code DeliveryAttachmentController}) 가 DELIVERY 유형 필터 조회에
 * 사용하는 {@link SlipAttachmentService#listByType} 메서드를 검증.
 */
@ExtendWith(MockitoExtension.class)
class SlipAttachmentServiceListByTypeTest {

    @Mock SlipRepository slipRepository;
    @Mock SlipAttachmentRepository attachmentRepository;
    @Mock SlipAttachmentStorage storage;

    @InjectMocks SlipAttachmentService service;

    @Test
    @DisplayName("listByType(DELIVERY) — repository 위임 후 DELIVERY 유형 목록 반환")
    void listByType_delivery_returnsList() {
        UUID slipId = UUID.randomUUID();
        SlipAttachment a = SlipAttachment.register(slipId, SlipAttachmentType.DELIVERY,
                "delivery.jpg", 1024L, "image/jpeg",
                "slip-attachments/" + slipId + "/abc.jpg",
                new BigDecimal("37.5"), new BigDecimal("127.0"), null, "driver-1");

        given(attachmentRepository
                .findBySlipIdAndAttachmentTypeAndIsDeletedFalseOrderByUploadedAtAsc(
                        slipId, SlipAttachmentType.DELIVERY))
                .willReturn(List.of(a));

        List<SlipAttachment> result = service.listByType(slipId, SlipAttachmentType.DELIVERY);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getAttachmentType()).isEqualTo(SlipAttachmentType.DELIVERY);
        assertThat(result.get(0).getUploadedBy()).isEqualTo("driver-1");
    }

    @Test
    @DisplayName("listByType(INSPECTION) — DELIVERY 유형 미포함 확인")
    void listByType_inspection_returnsEmpty() {
        UUID slipId = UUID.randomUUID();

        given(attachmentRepository
                .findBySlipIdAndAttachmentTypeAndIsDeletedFalseOrderByUploadedAtAsc(
                        slipId, SlipAttachmentType.INSPECTION))
                .willReturn(List.of());

        List<SlipAttachment> result = service.listByType(slipId, SlipAttachmentType.INSPECTION);

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("listPhotoAudit — LIKE 와일드카드를 리터럴로 전달")
    void listPhotoAudit_escapesLikeWildcards() {
        given(attachmentRepository.findPhotoAudit(null, null, null, "\\%\\_\\\\", PageRequest.of(0, 20)))
                .willReturn(new PageImpl<>(List.of()));

        service.listPhotoAudit(null, null, null, " %_\\ ", PageRequest.of(0, 20));

        verify(attachmentRepository).findPhotoAudit(null, null, null, "\\%\\_\\\\", PageRequest.of(0, 20));
    }
}
