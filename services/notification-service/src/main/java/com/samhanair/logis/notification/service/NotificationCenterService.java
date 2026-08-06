package com.samhanair.logis.notification.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.domain.NotificationCenter;
import com.samhanair.logis.notification.repository.NotificationCenterRepository;
import com.samhanair.logis.notification.web.dto.NotificationCenterPage;
import com.samhanair.logis.notification.web.dto.NotificationCenterResponse;
import com.samhanair.logis.notification.web.dto.NotificationPublishRequest;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사용자 통합 알림 센터 서비스 (Issue 4 Slice 1).
 *
 * <p>- publish: source service 가 internal endpoint 로 발송 요청 → notification_center INSERT
 * <p>- findMyUnread / findMyHistory: X-User-Id + X-User-Role 기반 자동 필터
 * <p>- acknowledge: read_at 설정. 이미 확인된 알림은 idempotent. 권한 미보유 시 FORBIDDEN.
 */
@Service
@RequiredArgsConstructor
public class NotificationCenterService {

    private final NotificationCenterRepository repository;

    @Transactional
    public UUID publish(NotificationPublishRequest req) {
        if (req.targetUserId() != null && req.sourceRefId() != null) {
            var existing = repository.findFirstByTargetUserIdAndSourceServiceAndSourceRefIdAndChannel(
                    req.targetUserId(), req.sourceService(), req.sourceRefId(), req.channel());
            if (existing.isPresent()) {
                return existing.get().getId();
            }
        }
        NotificationCenter n = NotificationCenter.publish(
                req.channel(), req.severity(), req.title(), req.body(),
                req.targetRole(), req.targetUserId(),
                req.sourceService(), req.sourceRefId(), req.deeplink());
        NotificationCenter saved = repository.save(n);
        return saved.getId();
    }

    @Transactional(readOnly = true)
    public List<NotificationCenterResponse> findMyUnread(UUID userId, String role) {
        return repository.findMyUnread(userId, role).stream()
                .map(NotificationCenterResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public NotificationCenterPage findMyHistory(UUID userId, String role, Pageable pageable) {
        Page<NotificationCenter> page = repository.findMyHistory(userId, role, pageable);
        return NotificationCenterPage.from(page.map(NotificationCenterResponse::from));
    }

    @Transactional
    public void acknowledge(UUID notificationId, UUID userId, String role) {
        NotificationCenter n = repository.findById(notificationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "알림을 찾을 수 없습니다"));

        if (!canAccess(n, userId, role)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "본인 알림이 아닙니다");
        }

        if (n.getReadAt() == null) {
            n.acknowledge(LocalDateTime.now());
            repository.save(n);
        }
    }

    private boolean canAccess(NotificationCenter n, UUID userId, String role) {
        if (userId != null && userId.equals(n.getTargetUserId())) {
            return true;
        }
        if (role == null) {
            return false;
        }
        String[] targetRole = n.getTargetRole();
        if (targetRole != null && targetRole.length > 0) {
            return Arrays.asList(targetRole).contains(role);
        }
        return false;
    }
}
