package com.samhanair.logis.shared.realtime.lock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.presence.PresenceColor;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FieldLockServiceTest {

    private RealtimeBroker broker;
    private MutableClock clock;
    private InMemoryFieldLockService service;
    private UUID documentId;

    @BeforeEach
    void setUp() {
        broker = mock(RealtimeBroker.class);
        clock = new MutableClock(Instant.parse("2026-06-30T00:00:00Z"));
        service = new InMemoryFieldLockService(broker, Duration.ofMinutes(5), clock);
        documentId = UUID.randomUUID();
    }

    @Test
    void acquireLock_alwaysRegistersMultipleSessionsOnSameFieldAndPublishesEvent() {
        FieldLockEntry first = service.acquireLock(
                documentId, "memo", "session-1", "account-user-1", "홍길동");
        FieldLockEntry second = service.acquireLock(
                documentId, "memo", "session-2", "account-user-2", "김관리");

        assertThat(first.documentId()).isEqualTo(documentId);
        assertThat(first.fieldPath()).isEqualTo("memo");
        assertThat(first.displayName()).isEqualTo("홍길동");
        assertThat(first.color()).isEqualTo(PresenceColor.fromUserId("account-user-1"));
        assertThat(service.getLock(documentId, "memo")).containsExactly(second, first);
        assertThat(service.listLocks(documentId)).containsExactly(second, first);
        verify(broker).publish(eq(documentId), eq(FieldLockService.EVENT_ACQUIRED), eq(first));
        verify(broker).publish(eq(documentId), eq(FieldLockService.EVENT_ACQUIRED), eq(second));
    }

    @Test
    void releaseLock_removesOnlyMatchingFieldSessionAndPublishesEvent() {
        FieldLockEntry memo = service.acquireLock(
                documentId, "memo", "session-1", "account-user-1", "홍길동");
        FieldLockEntry shipping = service.acquireLock(
                documentId, "shippingAddress", "session-1", "account-user-1", "홍길동");

        service.releaseLock(documentId, "memo", "session-1", "account-user-1");

        assertThat(service.getLock(documentId, "memo")).isEmpty();
        assertThat(service.listLocks(documentId)).containsExactly(shipping);
        verify(broker).publish(eq(documentId), eq(FieldLockService.EVENT_RELEASED), eq(memo));
    }

    @Test
    void releaseLock_ignoresReleaseFromNonOwnerSession() {
        FieldLockEntry memo = service.acquireLock(
                documentId, "memo", "session-1", "account-user-1", "홍길동");

        // 타 사용자(account-user-2)가 session-1 의 sessionId 로 해제 시도 → 소유자 불일치로 무시(no-op)
        service.releaseLock(documentId, "memo", "session-1", "account-user-2");
        assertThat(service.getLock(documentId, "memo")).containsExactly(memo);

        // 세션 등록자(account-user-1)는 정상 해제
        service.releaseLock(documentId, "memo", "session-1", "account-user-1");
        assertThat(service.getLock(documentId, "memo")).isEmpty();
    }

    @Test
    void acquireLock_sameFieldAndSessionRefreshesExistingEntry() {
        FieldLockEntry first = service.acquireLock(
                documentId, "memo", "session-1", "account-user-1", "홍길동");
        clock.advance(Duration.ofSeconds(30));
        FieldLockEntry refreshed = service.acquireLock(
                documentId, "memo", "session-1", "account-user-1", "홍길동");

        assertThat(refreshed.lockedAt()).isAfter(first.lockedAt());
        assertThat(service.getLock(documentId, "memo")).containsExactly(refreshed);
    }

    @Test
    void pruneExpiredLocks_removesStaleEntriesAndPublishesReleasedEvent() {
        FieldLockEntry active = service.acquireLock(
                documentId, "memo", "session-active", "active-user", "김활성");
        FieldLockEntry stale = service.acquireLock(
                documentId, "shippingAddress", "session-stale", "stale-user", "박만료");
        clock.advance(Duration.ofMinutes(4));
        service.acquireLock(documentId, active.fieldPath(), active.sessionId(), "active-user", active.displayName());
        clock.advance(Duration.ofMinutes(2));

        List<FieldLockEntry> removed = service.pruneExpiredLocks();

        assertThat(removed).containsExactly(stale);
        assertThat(service.listLocks(documentId)).containsExactly(
                active.withLockedAt(clock.instant().minus(Duration.ofMinutes(2))));
        verify(broker).publish(eq(documentId), eq(FieldLockService.EVENT_RELEASED), eq(stale));
    }

    @Test
    void acquireLock_normalizesDisplayNameAndRejectsBlankIdentity() {
        FieldLockEntry uuidName = service.acquireLock(
                documentId,
                "memo",
                "session-uuid-name",
                "account-user-1",
                "550e8400-e29b-41d4-a716-446655440000");

        assertThat(uuidName.displayName()).isEqualTo("사용자");
        assertThatThrownBy(() -> service.acquireLock(documentId, " ", "session-1", "user-1", "tester"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.acquireLock(documentId, "memo", " ", "user-1", "tester"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.acquireLock(documentId, "memo", "session-1", " ", "tester"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
