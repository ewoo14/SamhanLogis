package com.samhanair.logis.partnerorder.editrequest.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.editrequest.config.PartnerOrderEditRequestProperties;
import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
import com.samhanair.logis.partnerorder.editrequest.repository.PartnerOrderEditRequestRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderRealtimeBroker;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.service.PartnerSelfScopeGuard;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PartnerOrderEditRequestServiceTest {

    @Mock private PartnerOrderEditRequestRepository requestRepository;
    @Mock private PartnerOrderRepository partnerOrderRepository;
    @Mock private PartnerOrderRealtimeBroker broker;
    @Mock private PartnerSelfScopeGuard partnerSelfScopeGuard;

    private PartnerOrderEditRequestService service;
    private UUID orderId;
    private UUID requesterId;
    private UUID approverId;

    @BeforeEach
    void setUp() {
        service = new PartnerOrderEditRequestService(requestRepository, partnerOrderRepository,
                broker, new PartnerOrderEditRequestProperties(), partnerSelfScopeGuard);
        orderId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        approverId = UUID.randomUUID();
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        PartnerOrderEditRequest request = request(EditRequestType.EDIT);
        request.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "관리자B", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(orderId),
                eq(PartnerOrderEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        PartnerOrderEditRequest request = request(EditRequestType.DELETE);
        request.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.reject(requestId, UUID.randomUUID(), "관리자B", "불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(orderId),
                eq(PartnerOrderEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        UUID requestId = UUID.randomUUID();
        PartnerOrderEditRequest request = request(EditRequestType.EDIT);
        request.approve(approverId, "관리자A", null);
        request.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    private PartnerOrderEditRequest request(EditRequestType requestType) {
        PartnerOrderEditRequest request = PartnerOrderEditRequest.create(orderId, requesterId,
                "요청자", requestType, "사유", EditTargetRole.MANAGER, null);
        ReflectionTestUtils.setField(request, "id", UUID.randomUUID());
        return request;
    }
}
