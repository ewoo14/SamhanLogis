package com.samhanair.logis.inventory.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.realtime.domain.InventoryEditRequest;
import com.samhanair.logis.inventory.realtime.repository.InventoryEditRequestRepository;
import com.samhanair.logis.inventory.realtime.service.InventoryEditRequestService;
import com.samhanair.logis.inventory.repository.InventoryAuditRepository;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import java.lang.reflect.Field;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-H4b — InventoryEditRequestService 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class InventoryEditRequestServiceTest {

    @Mock
    private InventoryEditRequestRepository requestRepository;

    @Mock
    private InventoryAuditRepository auditRepository;

    @Mock
    private RealtimeBroker broker;

    private final EditLockGuard editLockGuard = new DefaultEditLockGuard();

    private InventoryEditRequestService service;

    private UUID auditId;
    private UUID requesterId;

    @BeforeEach
    void setUp() {
        service = new InventoryEditRequestService(requestRepository, auditRepository, broker, editLockGuard);
        auditId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        lenient().when(requestRepository.save(any(InventoryEditRequest.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void request_completedAudit_createsRequestWithPendingStatus() {
        InventoryAudit audit = stubAudit(AuditStatus.COMPLETED);
        when(auditRepository.findById(auditId)).thenReturn(Optional.of(audit));

        InventoryEditRequest result = service.request(auditId, EditRequestType.EDIT,
                "차이 분개 정정 필요", requesterId, "회계담당");

        assertThat(result.getStatus()).isEqualTo(EditRequestStatus.PENDING);
        assertThat(result.getEntityId()).isEqualTo(auditId);
        assertThat(result.getTargetRole()).isEqualTo(EditTargetRole.MANAGER);
        verify(broker).publish(eq(auditId),
                eq(InventoryEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void request_plannedAudit_throwsInvalidInput() {
        InventoryAudit audit = stubAudit(AuditStatus.PLANNED);
        when(auditRepository.findById(auditId)).thenReturn(Optional.of(audit));

        assertThatThrownBy(() -> service.request(auditId, EditRequestType.EDIT, null,
                requesterId, "x"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("PLANNED");
        verify(broker, never()).publish(any(), anyString(), any());
    }

    @Test
    void request_cancelledAudit_throwsInvalidInput() {
        InventoryAudit audit = stubAudit(AuditStatus.CANCELLED);
        when(auditRepository.findById(auditId)).thenReturn(Optional.of(audit));

        assertThatThrownBy(() -> service.request(auditId, EditRequestType.EDIT, null,
                requesterId, "x"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("CANCELLED");
    }

    @Test
    void request_auditNotFound_throwsNotFound() {
        when(auditRepository.findById(auditId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.request(auditId, EditRequestType.EDIT, null,
                requesterId, "x"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("재고 실사");
    }

    @Test
    void approve_pendingRequest_transitionsToApprovedAndPublishesEvent() {
        UUID requestId = UUID.randomUUID();
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        InventoryEditRequest approved = service.approve(requestId, UUID.randomUUID(), "관리자", "ok");

        assertThat(approved.getStatus()).isEqualTo(EditRequestStatus.APPROVED);
        verify(broker).publish(eq(auditId),
                eq(InventoryEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_pendingRequest_transitionsToRejected() {
        UUID requestId = UUID.randomUUID();
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        InventoryEditRequest rejected = service.reject(requestId, UUID.randomUUID(), "관리자",
                "분개 검토 결과 정정 불필요");

        assertThat(rejected.getStatus()).isEqualTo(EditRequestStatus.REJECTED);
        assertThat(rejected.getDecisionReason()).isEqualTo("분개 검토 결과 정정 불필요");
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "관리자B", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(auditId),
                eq(InventoryEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.DELETE, "삭제", EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.reject(requestId, UUID.randomUUID(), "관리자B", "불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(auditId),
                eq(InventoryEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        UUID requestId = UUID.randomUUID();
        InventoryEditRequest request = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        request.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void guardCanEdit_completedWithApproval_passes() {
        InventoryAudit audit = stubAudit(AuditStatus.COMPLETED);
        InventoryEditRequest approved = InventoryEditRequest.create(auditId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        approved.approve(UUID.randomUUID(), "관리자", null);
        when(requestRepository.findFirstByEntityIdAndStatus(auditId, EditRequestStatus.APPROVED))
                .thenReturn(Optional.of(approved));

        // no throw
        service.guardCanEdit(audit);
    }

    @Test
    void guardCanEdit_completedWithoutApproval_throws() {
        InventoryAudit audit = stubAudit(AuditStatus.COMPLETED);
        when(requestRepository.findFirstByEntityIdAndStatus(auditId, EditRequestStatus.APPROVED))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.guardCanEdit(audit))
                .isInstanceOf(com.samhanair.logis.shared.realtime.lock.LockedException.class);
    }

    private InventoryAudit stubAudit(AuditStatus status) {
        // 도메인 factory 우회 (Warehouse 가 모든 필드 검증) — 본 테스트는 status / id 만 필요.
        try {
            java.lang.reflect.Constructor<InventoryAudit> ctor =
                    InventoryAudit.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            InventoryAudit audit = ctor.newInstance();
            setField(audit, "status", status);
            setField(audit, "id", auditId);
            return audit;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @SuppressWarnings("SameParameterValue")
    private static void setField(Object target, String name, Object value) {
        try {
            Field f = findField(target.getClass(), name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static Field findField(Class<?> clazz, String name) throws NoSuchFieldException {
        Class<?> cur = clazz;
        while (cur != null) {
            try {
                return cur.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                cur = cur.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }
}
