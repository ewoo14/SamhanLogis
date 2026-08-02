package com.samhanair.logis.slip.attachment.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.repository.SlipLineRepository;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.service.SlipPartnerBackfillService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.web.SlipInternalController;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class SlipInternalAttachmentControllerTest {

    @Mock
    private SlipAttachmentService attachmentService;
    @Mock
    private SlipSignatureService signatureService;
    @Mock
    private SlipLineRepository slipLineRepository;
    @Mock
    private com.samhanair.logis.slip.repository.SlipRepository slipRepository;
    @Mock
    private SlipService slipService;
    @Mock
    private SlipPartnerBackfillService slipPartnerBackfillService;
    @Mock
    private WarehouseInternalClient warehouseInternalClient;

    @Test
    void upload_allowsDeliveryAndInspectionOnlyAndForwardsToService() {
        UUID slipId = UUID.randomUUID();
        LocalDateTime capturedAt = LocalDateTime.of(2026, 5, 15, 14, 0);
        MockMultipartFile file = new MockMultipartFile(
                "file", "inspection.png", "image/png", new byte[]{1, 2, 3});
        SlipAttachment saved = SlipAttachment.register(
                slipId,
                SlipAttachmentType.INSPECTION,
                "inspection.png",
                3L,
                "image/png",
                "slip-attachments/test/inspection.png",
                new BigDecimal("37.4979000"),
                new BigDecimal("127.0276000"),
                capturedAt,
                "DR-001");
        when(attachmentService.upload(
                slipId,
                SlipAttachmentType.INSPECTION,
                file,
                new BigDecimal("37.4979000"),
                new BigDecimal("127.0276000"),
                capturedAt,
                "DR-001")).thenReturn(saved);

        SlipInternalController controller = new SlipInternalController(
                signatureService, attachmentService, slipLineRepository, slipRepository, slipService,
                slipPartnerBackfillService, warehouseInternalClient);

        var response = controller.uploadAttachment(
                slipId,
                SlipAttachmentType.INSPECTION,
                file,
                new BigDecimal("37.4979000"),
                new BigDecimal("127.0276000"),
                capturedAt,
                "DR-001");

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData().attachmentType()).isEqualTo(SlipAttachmentType.INSPECTION);
        assertThat(response.getData().fileName()).isEqualTo("inspection.png");
        assertThat(response.getData().fileSize()).isEqualTo(3L);
        verify(attachmentService).upload(
                slipId,
                SlipAttachmentType.INSPECTION,
                file,
                new BigDecimal("37.4979000"),
                new BigDecimal("127.0276000"),
                capturedAt,
                "DR-001");
    }

    @Test
    void upload_rejectsEstimateTypeForInternalDriverPhotoBridge() {
        SlipAttachmentService service = attachmentService;
        SlipInternalController controller = new SlipInternalController(
                signatureService, service, slipLineRepository, slipRepository, slipService,
                slipPartnerBackfillService, warehouseInternalClient);

        assertThatThrownBy(() -> controller.uploadAttachment(
                UUID.randomUUID(),
                SlipAttachmentType.ESTIMATE,
                new MockMultipartFile("file", "estimate.png", "image/png", new byte[]{1}),
                null,
                null,
                null,
                null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("DELIVERY/INSPECTION");

        verifyNoInteractions(service);
    }
}
