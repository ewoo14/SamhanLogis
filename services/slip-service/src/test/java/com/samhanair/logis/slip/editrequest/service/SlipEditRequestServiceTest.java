package com.samhanair.logis.slip.editrequest.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.editrequest.config.SlipEditRequestProperties;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import com.samhanair.logis.slip.editrequest.repository.SlipEditRequestRepository;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
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
 * PR-H3 BE — SlipEditRequestService 단위 테스트 (9 case, fix 후 CONFIRMED 추가).
 *
 * <ol>
 *   <li>request — DRAFT/SAVED/SENT 단계 → INVALID_INPUT (작성자 직접 가능)</li>
 *   <li>request — ACCEPTED 단계 → 정상 PENDING 생성 + broker.publish + notification</li>
 *   <li>request — CONFIRMED 단계 → 정상 PENDING 생성 (FE banner 정합, LOCKED_REQUIRES_APPROVAL)</li>
 *   <li>request — INSPECTING 단계 → CONFLICT (완전 잠금)</li>
 *   <li>request — DELIVERED 단계 → CONFLICT (완전 잠금)</li>
 *   <li>approve — PENDING → APPROVED + 작성자 푸시 + SSE</li>
 *   <li>reject — PENDING → REJECTED + 거절 사유 푸시 + SSE</li>
 *   <li>approve — 이미 APPROVED 인 요청 → CONFLICT (재승인 차단)</li>
 *   <li>expirePending — PENDING + expires_at 과거 → EXPIRED 전환 + SSE</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SlipEditRequestServiceTest {

    @Mock private SlipEditRequestRepository requestRepository;
    @Mock private SlipRepository slipRepository;
    @Mock private SlipRealtimeBroker broker;
    @Mock private NotificationClient notificationClient;

    private SlipEditRequestProperties properties;
    @InjectMocks private SlipEditRequestService service;

    private UUID slipId;
    private UUID requesterId;
    private Slip slip;

    @BeforeEach
    void setUp() {
        properties = new SlipEditRequestProperties();
        properties.setExpiresHours(24);
        // @InjectMocks 가 properties 를 주입하지 못하므로 reflection 으로 주입
        ReflectionTestUtils.setField(service, "properties", properties);

        slipId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        slip = Slip.createOutbound("2026/05/10-001", LocalDate.now(), 1,
                UUID.randomUUID(), null, null, "거래처A",
                null, "원본 메모", "user-1");
        // 초기 status = DRAFT, 본 PR 시나리오 별로 transitionTo 호출
    }

    // === request === //

    @Test
    void request_draftStage_throwsInvalidInput() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        // slip 은 DRAFT 상태

        assertThatThrownBy(() -> service.request(slipId, SlipEditRequestType.EDIT,
                "수정 사유", requesterId, "홍길동"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);

        verify(requestRepository, never()).save(any());
        verify(broker, never()).publish(any(), anyString(), any());
    }

    @Test
    void request_acceptedStage_createsPendingAndPublishesAndNotifies() {
        // slip status = ACCEPTED 로 전이
        slip.save();
        slip.send();
        slip.accept(UUID.randomUUID().toString());

        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(requestRepository.save(any(SlipEditRequest.class))).thenAnswer(inv -> {
            SlipEditRequest r = inv.getArgument(0);
            ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
            return r;
        });

        SlipEditRequest saved = service.request(slipId, SlipEditRequestType.EDIT,
                "거래처명 오타 수정", requesterId, "홍길동");

        assertThat(saved.getStatus()).isEqualTo(SlipEditRequestStatus.PENDING);
        assertThat(saved.getRequestType()).isEqualTo(SlipEditRequestType.EDIT);
        assertThat(saved.getTargetRole()).isEqualTo(SlipEditTargetRole.WAREHOUSE);
        assertThat(saved.getReason()).isEqualTo("거래처명 오타 수정");
        assertThat(saved.getExpiresAt()).isNotNull();
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void request_confirmedStage_createsPendingForFeBannerParity() {
        // QA Major fix 회귀 가드 — FE SlipDetailPage 가 CONFIRMED 에서 banner 노출.
        // 사용자 명시 정책: CONFIRMED ∈ LOCKED_REQUIRES_APPROVAL (창고 수락 필요).
        slip.save();
        slip.send();
        slip.accept(UUID.randomUUID().toString());
        slip.process();
        slip.complete(); // → INSPECTING
        slip.inspect(UUID.randomUUID().toString()); // → COMPLETED
        slip.ship(); // → SHIPPING
        slip.deliver(); // → DELIVERED
        slip.confirm(); // → CONFIRMED

        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(requestRepository.save(any(SlipEditRequest.class))).thenAnswer(inv -> {
            SlipEditRequest r = inv.getArgument(0);
            ReflectionTestUtils.setField(r, "id", UUID.randomUUID());
            return r;
        });

        SlipEditRequest saved = service.request(slipId, SlipEditRequestType.EDIT,
                "확정 후 거래처명 정정", requesterId, "홍길동");

        assertThat(saved.getStatus()).isEqualTo(SlipEditRequestStatus.PENDING);
        assertThat(saved.getTargetRole()).isEqualTo(SlipEditTargetRole.WAREHOUSE);
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void request_inspectingStage_throwsConflictFullyLocked() {
        // slip → INSPECTING 으로 전이
        slip.save();
        slip.send();
        slip.accept(UUID.randomUUID().toString());
        slip.process();
        slip.complete(); // PROCESSING → INSPECTING

        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.request(slipId, SlipEditRequestType.DELETE,
                "삭제 요청", requesterId, "홍길동"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(requestRepository, never()).save(any());
    }

    @Test
    void request_deliveredStage_throwsConflictFullyLocked() {
        // slip → DELIVERED 까지 전이
        slip.save();
        slip.send();
        slip.accept(UUID.randomUUID().toString());
        slip.process();
        slip.complete(); // INSPECTING
        slip.inspect(UUID.randomUUID().toString()); // COMPLETED
        slip.ship(); // SHIPPING
        slip.deliver(); // DELIVERED

        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.request(slipId, SlipEditRequestType.EDIT,
                null, requesterId, "홍길동"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    // === approve / reject === //

    @Test
    void approve_pendingRequest_transitionsAndPublishesAndNotifiesRequester() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest pending = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(pending, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(pending));

        UUID approverId = UUID.randomUUID();
        SlipEditRequest result = service.approve(requestId, approverId, "창고직원-A", "확인");

        assertThat(result.getStatus()).isEqualTo(SlipEditRequestStatus.APPROVED);
        assertThat(result.getDecidedById()).isEqualTo(approverId);
        assertThat(result.getDecidedByName()).isEqualTo("창고직원-A");
        assertThat(result.getDecisionReason()).isEqualTo("확인");
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipEditRequestService.EVENT_REQUEST_DECIDED), any());
        verify(notificationClient, times(1))
                .sendUserPush(eq(requesterId), anyString(), anyString());
    }

    @Test
    void reject_pendingRequest_transitionsAndNotifiesWithReason() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest pending = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.DELETE, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(pending, "id", requestId);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(pending));

        UUID approverId = UUID.randomUUID();
        SlipEditRequest result = service.reject(requestId, approverId, "창고직원-B",
                "이미 출고 처리 시작됨");

        assertThat(result.getStatus()).isEqualTo(SlipEditRequestStatus.REJECTED);
        assertThat(result.getDecisionReason()).isEqualTo("이미 출고 처리 시작됨");
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipEditRequestService.EVENT_REQUEST_DECIDED), any());
        verify(notificationClient, times(1))
                .sendUserPush(eq(requesterId), anyString(), anyString());
    }

    @Test
    void approve_alreadyApproved_throwsConflict() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest approved = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(approved, "id", requestId);
        approved.approve(UUID.randomUUID(), "이전 승인자", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(approved));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "다른 승인자", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(notificationClient, never()).sendUserPush(any(), anyString(), anyString());
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest approved = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(approved, "id", requestId);
        approved.approve(UUID.randomUUID(), "이전 승인자", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(approved));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "다른 승인자", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(broker, never()).publish(eq(slipId),
                eq(SlipEditRequestService.EVENT_REQUEST_DECIDED), any());
        verify(notificationClient, never()).sendUserPush(any(), anyString(), anyString());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest approved = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.DELETE, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(approved, "id", requestId);
        approved.approve(UUID.randomUUID(), "이전 승인자", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(approved));

        assertThatThrownBy(() -> service.reject(requestId, UUID.randomUUID(), "다른 승인자", "불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(broker, never()).publish(eq(slipId),
                eq(SlipEditRequestService.EVENT_REQUEST_DECIDED), any());
        verify(notificationClient, never()).sendUserPush(any(), anyString(), anyString());
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        UUID requestId = UUID.randomUUID();
        SlipEditRequest approved = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(approved, "id", requestId);
        approved.approve(UUID.randomUUID(), "이전 승인자", null);
        approved.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(approved));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    // === scheduled expiry === //

    @Test
    void expirePending_pastExpiresAt_transitionsToExpiredAndPublishes() {
        SlipEditRequest expired1 = SlipEditRequest.create(slipId, requesterId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE,
                java.time.LocalDateTime.now().minusHours(1));
        ReflectionTestUtils.setField(expired1, "id", UUID.randomUUID());
        SlipEditRequest expired2 = SlipEditRequest.create(slipId, requesterId, "다른요청자",
                SlipEditRequestType.DELETE, null, SlipEditTargetRole.WAREHOUSE,
                java.time.LocalDateTime.now().minusHours(2));
        ReflectionTestUtils.setField(expired2, "id", UUID.randomUUID());
        lenient().when(requestRepository.findExpired(any())).thenReturn(List.of(expired1, expired2));

        service.expirePending();

        assertThat(expired1.getStatus()).isEqualTo(SlipEditRequestStatus.EXPIRED);
        assertThat(expired2.getStatus()).isEqualTo(SlipEditRequestStatus.EXPIRED);
        verify(broker, times(2))
                .publish(eq(slipId), eq(SlipEditRequestService.EVENT_REQUEST_DECIDED), any());
    }
}
