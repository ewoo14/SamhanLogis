package com.samhanair.logis.partnerauth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.service.PartnerApprovalService;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 구버전 데스크톱이 사용하는 access-preview 배열 응답 계약을 고정한다. */
class PartnerApprovalsControllerContractTest {

    @Test
    void accessPreviewKeepsLegacyArrayDataShape() {
        PartnerApprovalService service = mock(PartnerApprovalService.class);
        when(service.previewLongUnused(30)).thenReturn(List.of(mock(PartnerApprovalResponse.class)));
        PartnerApprovalsController controller = new PartnerApprovalsController(service);

        Object data = controller.accessPreview(30).getData();

        assertThat(data).isInstanceOf(List.class);
    }
}
