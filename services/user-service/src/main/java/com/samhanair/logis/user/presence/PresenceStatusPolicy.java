package com.samhanair.logis.user.presence;

import java.time.Duration;
import java.time.Instant;

/** 자동 idle 전환 규칙. 수동 전용 상태는 어떤 idle 경과에도 보존한다. */
public final class PresenceStatusPolicy {
    private PresenceStatusPolicy() {}

    public static PresenceStatus automaticStatus(PresenceStatus current, Instant lastActivity, Instant now) {
        if (current == PresenceStatus.IN_MEETING || current == PresenceStatus.ON_CALL
                || current == PresenceStatus.OFFLINE) return current;
        long idleMinutes = Math.max(0, Duration.between(lastActivity, now).toMinutes());
        return idleMinutes >= 30 ? PresenceStatus.ABSENT
                : idleMinutes >= 10 ? PresenceStatus.AWAY
                : PresenceStatus.AVAILABLE;
    }
}
