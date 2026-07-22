package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.notification.domain.NotificationCenter;
import com.samhanair.logis.notification.domain.NotificationSeverity;
import com.samhanair.logis.notification.repository.NotificationCenterRepository;
import com.samhanair.logis.notification.web.dto.NotificationCenterPage;
import com.samhanair.logis.notification.web.dto.NotificationCenterResponse;
import com.samhanair.logis.notification.web.dto.NotificationPublishRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
class NotificationCenterServiceTest {

    @Mock private NotificationCenterRepository repository;

    @InjectMocks private NotificationCenterService service;

    private UUID userId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
    }

    @Test
    @DisplayName("publish: 신규 알림 row INSERT 후 ID 반환")
    void publish_createsNotification() {
        NotificationPublishRequest req = new NotificationPublishRequest(
                "SAFETY_STOCK", NotificationSeverity.WARNING,
                "AJ056 부족", "현재 30 / 임계 50",
                List.of("MASTER", "MANAGER"), null,
                "inventory-service", "product-1+warehouse-A",
                "/inventory/safety-stock-alerts");

        NotificationCenter saved = NotificationCenter.publish(
                req.channel(), req.severity(), req.title(), req.body(),
                req.targetRole(), req.targetUserId(), req.sourceService(),
                req.sourceRefId(), req.deeplink());
        when(repository.save(any(NotificationCenter.class))).thenReturn(saved);

        UUID id = service.publish(req);

        assertThat(id).isEqualTo(saved.getId());
        ArgumentCaptor<NotificationCenter> captor = ArgumentCaptor.forClass(NotificationCenter.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTargetRole()).containsExactly("MASTER", "MANAGER");
    }

    @Test
    @DisplayName("findMyUnread: role + userId 조합으로 조회")
    void findMyUnread_callsRepositoryWithRoleAndUserId() {
        when(repository.findMyUnread(userId, "MASTER"))
                .thenReturn(List.of(stubNotification()));

        List<NotificationCenterResponse> result = service.findMyUnread(userId, "MASTER");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).channel()).isEqualTo("SAFETY_STOCK");
    }

    @Test
    @DisplayName("findMyUnread: sourceRefId를 응답 refId로 보존한다")
    void findMyUnread_preservesSourceRefIdAsRefId() {
        NotificationCenter notification = NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO,
                "새 메시지", "본문", null, userId,
                "groupware-service", "message-source-42", "/messenger");
        when(repository.findMyUnread(userId, null)).thenReturn(List.of(notification));

        List<NotificationCenterResponse> result = service.findMyUnread(userId, null);

        assertThat(result).singleElement()
                .extracting(NotificationCenterResponse::refId)
                .isEqualTo("message-source-42");
    }

    @Test
    @DisplayName("findMyUnread: 조회 결과 0건 시 빈 list")
    void findMyUnread_emptyResult_returnsEmptyList() {
        when(repository.findMyUnread(userId, "SALES")).thenReturn(List.of());

        List<NotificationCenterResponse> result = service.findMyUnread(userId, "SALES");

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("findMyHistory: pageable 전달 + page response 매핑")
    void findMyHistory_returnsPageResponse() {
        NotificationCenter n = stubNotification();
        Page<NotificationCenter> page = new PageImpl<>(List.of(n), PageRequest.of(0, 50), 1);
        when(repository.findMyHistory(eq(userId), eq("MASTER"), any())).thenReturn(page);

        NotificationCenterPage response = service.findMyHistory(userId, "MASTER", PageRequest.of(0, 50));

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).id()).isEqualTo(n.getId());
    }

    @Test
    @DisplayName("acknowledge: 미확인 알림 → read_at 설정 + save")
    void acknowledge_unreadNotification_setsReadAt() {
        NotificationCenter n = stubNotification();
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));
        when(repository.save(n)).thenReturn(n);

        service.acknowledge(n.getId(), userId, "MASTER");

        assertThat(n.getReadAt()).isNotNull();
        verify(repository).save(n);
    }

    @Test
    @DisplayName("acknowledge: 이미 확인된 알림 → idempotent (save 호출 X)")
    void acknowledge_alreadyRead_isIdempotent() {
        NotificationCenter n = stubNotification();
        n.acknowledge(LocalDateTime.now().minusHours(1));
        LocalDateTime originalReadAt = n.getReadAt();
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));

        service.acknowledge(n.getId(), userId, "MASTER");

        assertThat(n.getReadAt()).isEqualTo(originalReadAt);
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("acknowledge: 다중 role 배열 중 두 번째 role 도 접근 허용")
    void acknowledge_multipleTargetRoles_allowsSecondRole() {
        NotificationCenter n = stubNotification();
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));
        when(repository.save(n)).thenReturn(n);

        service.acknowledge(n.getId(), userId, "MANAGER");

        assertThat(n.getReadAt()).isNotNull();
        verify(repository).save(n);
    }

    @Test
    @DisplayName("acknowledge: role null 이면 target_user_id 매칭만 접근 허용")
    void acknowledge_nullRole_allowsUserIdTarget() {
        NotificationCenter n = NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO,
                "메시지", "내용",
                null, userId,
                "groupware-service", "msg-user", "/messenger");
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));
        when(repository.save(n)).thenReturn(n);

        service.acknowledge(n.getId(), userId, null);

        assertThat(n.getReadAt()).isNotNull();
        verify(repository).save(n);
    }

    @Test
    @DisplayName("acknowledge: role null 이면 role broadcast 알림 접근 거절")
    void acknowledge_nullRole_rejectsRoleBroadcast() {
        NotificationCenter n = stubNotification();
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));

        assertThatThrownBy(() -> service.acknowledge(n.getId(), userId, null))
                .isInstanceOf(BusinessException.class);
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("acknowledge: 권한 없는 알림 → FORBIDDEN")
    void acknowledge_notMyNotification_throwsForbidden() {
        NotificationCenter n = NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO,
                "메시지", "내용",
                null, UUID.randomUUID(),  // 다른 사용자에게만 노출
                "groupware-service", "msg-1", "/messenger");
        when(repository.findById(n.getId())).thenReturn(Optional.of(n));

        assertThatThrownBy(() -> service.acknowledge(n.getId(), userId, "SALES"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("acknowledge: 존재하지 않는 ID → NOT_FOUND")
    void acknowledge_unknownId_throwsNotFound() {
        UUID unknown = UUID.randomUUID();
        when(repository.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.acknowledge(unknown, userId, "MASTER"))
                .isInstanceOf(BusinessException.class);
    }

    private NotificationCenter stubNotification() {
        return NotificationCenter.publish(
                "SAFETY_STOCK", NotificationSeverity.WARNING,
                "AJ056 부족", "현재 30 / 임계 50",
                List.of("MASTER", "MANAGER"), null,
                "inventory-service", "product-1", "/inventory/safety-stock-alerts");
    }
}
