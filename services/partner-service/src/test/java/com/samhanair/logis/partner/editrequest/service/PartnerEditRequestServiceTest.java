package com.samhanair.logis.partner.editrequest.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.editrequest.domain.PartnerEditRequest;
import com.samhanair.logis.partner.editrequest.repository.PartnerEditRequestRepository;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-H4b BE-A — PartnerEditRequestService 단위 테스트 (5 case).
 */
@ExtendWith(MockitoExtension.class)
class PartnerEditRequestServiceTest {

    @Mock private PartnerEditRequestRepository requestRepository;
    @Mock private RealtimeBroker broker;

    @InjectMocks private PartnerEditRequestService service;

    private UUID entityId;
    private UUID requesterId;
    private UUID approverId;

    @BeforeEach
    void setUp() {
        entityId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        approverId = UUID.randomUUID();
    }

    @Test
    void request_createsPendingWithManagerTargetRole_andBroadcastsCreated() {
        when(requestRepository.save(any(PartnerEditRequest.class))).thenAnswer(inv -> {
            PartnerEditRequest req = inv.getArgument(0);
            ReflectionTestUtils.setField(req, "id", UUID.randomUUID());
            return req;
        });

        PartnerEditRequest saved = service.request(entityId, EditRequestType.EDIT,
                "차단 해제 요청", requesterId, "이수민");

        assertThat(saved.getStatus()).isEqualTo(EditRequestStatus.PENDING);
        assertThat(saved.getTargetRole()).isEqualTo(EditTargetRole.MANAGER);
        verify(broker, times(1))
                .publish(eq(entityId), eq(PartnerEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void approve_transitionsToApproved_andBroadcastsDecided() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, LocalDateTime.now().plusHours(24));
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        PartnerEditRequest approved = service.approve(requestId, approverId, "관리자A", null);

        assertThat(approved.getStatus()).isEqualTo(EditRequestStatus.APPROVED);
        assertThat(approved.getDecidedByName()).isEqualTo("관리자A");
        verify(broker, times(1))
                .publish(eq(entityId), eq(PartnerEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_requiresReason_andTransitionsToRejected() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.DELETE, "삭제요청", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        PartnerEditRequest rejected = service.reject(requestId, approverId, "관리자A", "정책상 불가");

        assertThat(rejected.getStatus()).isEqualTo(EditRequestStatus.REJECTED);
        assertThat(rejected.getDecisionReason()).isEqualTo("정책상 불가");
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        req.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        assertThatThrownBy(() -> service.approve(requestId, approverId, "관리자B", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never())
                .publish(eq(entityId), eq(PartnerEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.DELETE, "삭제요청", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        req.approve(approverId, "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        assertThatThrownBy(() -> service.reject(requestId, approverId, "관리자B", "정책상 불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never())
                .publish(eq(entityId), eq(PartnerEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void findActiveApproval_returnsRequestId_whenApprovedExists() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findFirstByEntityIdAndStatus(entityId, EditRequestStatus.APPROVED))
                .thenReturn(Optional.of(req));

        Optional<UUID> result = service.findActiveApproval(entityId);

        assertThat(result).contains(requestId);
    }

    @Test
    void consumeApproval_throwsNotFound_whenRequestMissing() {
        UUID requestId = UUID.randomUUID();
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        PartnerEditRequest req = PartnerEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        req.approve(approverId, "관리자A", null);
        req.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(any(), anyString(), any());
    }
}
