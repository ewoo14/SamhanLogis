package com.samhanair.logis.accounting.editrequest.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.editrequest.domain.AccountingEditRequest;
import com.samhanair.logis.accounting.editrequest.repository.AccountingEditRequestRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * PR-H4b BE-A — AccountingEditRequestService 단위 테스트 (5 case).
 *
 * <ol>
 *   <li>request — 정상 PENDING 생성 + targetRole=MANAGER + SSE created broadcast</li>
 *   <li>approve — APPROVED 전이 + decided broadcast</li>
 *   <li>reject — REJECTED 전이 + decisionReason 보존</li>
 *   <li>findActiveApproval — APPROVED 1건 lookup → requestId 반환</li>
 *   <li>consumeApproval — soft-delete 패턴 (요청 미존재 시 NOT_FOUND)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class AccountingEditRequestServiceTest {

    @Mock private AccountingEditRequestRepository requestRepository;
    @Mock private RealtimeBroker broker;
    @Mock private NotificationPublisher notificationPublisher;

    @InjectMocks private AccountingEditRequestService service;

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
        when(requestRepository.save(any(AccountingEditRequest.class))).thenAnswer(inv -> {
            AccountingEditRequest req = inv.getArgument(0);
            ReflectionTestUtils.setField(req, "id", UUID.randomUUID());
            return req;
        });

        AccountingEditRequest saved = service.request(entityId, EditRequestType.EDIT,
                "발행 후 거래처 정정", requesterId, "이수민");

        assertThat(saved.getStatus()).isEqualTo(EditRequestStatus.PENDING);
        assertThat(saved.getTargetRole()).isEqualTo(EditTargetRole.MANAGER);
        assertThat(saved.getRequesterName()).isEqualTo("이수민");
        verify(broker, times(1))
                .publish(eq(entityId), eq(AccountingEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void request_publishesApprovalNotificationCenterEvent_afterCommit() {
        when(requestRepository.save(any(AccountingEditRequest.class))).thenAnswer(inv -> {
            AccountingEditRequest req = inv.getArgument(0);
            ReflectionTestUtils.setField(req, "id", UUID.randomUUID());
            return req;
        });

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.request(entityId, EditRequestType.EDIT, "발행 후 거래처 정정",
                    requesterId, "이수민");

            verify(notificationPublisher, never()).publish(any());
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        NotificationPublishRequest req = captor.getValue();
        assertThat(req.channel()).isEqualTo("APPROVAL");
        assertThat(req.targetRole()).containsExactly("MASTER", "MANAGER");
        assertThat(req.targetUserId()).isNull();
        assertThat(req.deeplink()).isEqualTo("/admin/accounting-edit-requests");
    }

    @Test
    void approve_transitionsToApproved_andBroadcastsDecided() {
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, LocalDateTime.now().plusHours(24));
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        AccountingEditRequest approved = service.approve(requestId, approverId, "관리자A", "OK");

        assertThat(approved.getStatus()).isEqualTo(EditRequestStatus.APPROVED);
        assertThat(approved.getDecidedByName()).isEqualTo("관리자A");
        verify(broker, times(1))
                .publish(eq(entityId), eq(AccountingEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void approve_publishesNotificationCenterEvent_toRequester_afterCommit() {
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, LocalDateTime.now().plusHours(24));
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.approve(requestId, approverId, "관리자A", "OK");

            verify(notificationPublisher, never()).publish(any());
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        NotificationPublishRequest request = captor.getValue();
        assertThat(request.channel()).isEqualTo("APPROVAL");
        assertThat(request.severity()).isEqualTo(NotificationSeverity.INFO);
        assertThat(request.targetRole()).isNull();
        assertThat(request.targetUserId()).isEqualTo(requesterId);
        assertThat(request.deeplink()).isEqualTo("/admin/accounting-edit-requests");
    }

    @Test
    void reject_requiresReason_andTransitionsToRejected() {
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.DELETE, "삭제요청", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        AccountingEditRequest rejected = service.reject(requestId, approverId, "관리자A",
                "정책상 불가");

        assertThat(rejected.getStatus()).isEqualTo(EditRequestStatus.REJECTED);
        assertThat(rejected.getDecisionReason()).isEqualTo("정책상 불가");
    }

    @Test
    void reject_publishesNotificationCenterEvent_toRequester_afterCommit() {
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.DELETE, "삭제요청", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.reject(requestId, approverId, "관리자A", "정책상 불가");

            verify(notificationPublisher, never()).publish(any());
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        NotificationPublishRequest request = captor.getValue();
        assertThat(request.channel()).isEqualTo("APPROVAL");
        assertThat(request.severity()).isEqualTo(NotificationSeverity.WARNING);
        assertThat(request.targetRole()).isNull();
        assertThat(request.targetUserId()).isEqualTo(requesterId);
        assertThat(request.deeplink()).isEqualTo("/admin/accounting-edit-requests");
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        // race 가드 — 첫 트랜잭션이 APPROVED 로 commit 한 직후 두 번째 트랜잭션이
        // findByIdForDecision (PESSIMISTIC_WRITE) 으로 같은 row 조회 → 이미 APPROVED →
        // requirePending() 가 BusinessException(CONFLICT) 던짐 → 알림 발송 안 됨.
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.EDIT, "사유", EditTargetRole.MANAGER, LocalDateTime.now().plusHours(24));
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        req.approve(approverId, "관리자A", "OK");  // 첫 결정 (이미 APPROVED)
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThatThrownBy(() -> service.approve(requestId, approverId, "관리자B", "재시도"))
                    .isInstanceOf(BusinessException.class);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        verify(notificationPublisher, never()).publish(any());
        verify(broker, never())
                .publish(eq(entityId), eq(AccountingEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        // race 가드 — reject 도 동일. 이미 APPROVED 된 요청 reject 시도 시 CONFLICT.
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
                EditRequestType.DELETE, "삭제요청", EditTargetRole.MANAGER, null);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(req, "id", requestId);
        req.approve(approverId, "관리자A", null);  // 이미 APPROVED
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(req));

        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThatThrownBy(() -> service.reject(requestId, approverId, "관리자B", "정책상 불가"))
                    .isInstanceOf(BusinessException.class);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        verify(notificationPublisher, never()).publish(any());
        verify(broker, never())
                .publish(eq(entityId), eq(AccountingEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void findActiveApproval_returnsRequestId_whenApprovedExists() {
        AccountingEditRequest req = AccountingEditRequest.create(entityId, requesterId, "이수민",
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
        when(requestRepository.findById(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class);
    }
}
