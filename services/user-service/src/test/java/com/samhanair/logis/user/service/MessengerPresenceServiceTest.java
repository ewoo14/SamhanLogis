package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class MessengerPresenceServiceTest {
    @Test
    void any_desktop_or_mobile_session_means_available() {
        var user = UUID.randomUUID();
        var service = new MessengerPresenceService();

        service.join(user, "desktop-1");
        assertThat(service.status(user)).isEqualTo(MessengerPresenceService.PresenceStatus.AVAILABLE);
        service.leave(user, "desktop-1");
        assertThat(service.status(user)).isEqualTo(MessengerPresenceService.PresenceStatus.OFFLINE);
    }

    @Test
    void manual_absent_overrides_live_sessions_until_changed() {
        var user = UUID.randomUUID();
        var service = new MessengerPresenceService();

        service.join(user, "mobile-1");
        service.setManualStatus(user, MessengerPresenceService.PresenceStatus.ABSENT);
        assertThat(service.status(user)).isEqualTo(MessengerPresenceService.PresenceStatus.ABSENT);
    }
}
