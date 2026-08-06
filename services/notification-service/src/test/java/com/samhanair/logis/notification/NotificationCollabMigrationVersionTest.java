package com.samhanair.logis.notification;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class NotificationCollabMigrationVersionTest {

    @Test
    void idempotencyNormalizationMigrationIsAfterAppliedNotificationSchema() {
        assertThat(new ClassPathResource(
                "db/migration/V9__normalize_blank_notification_idempotency_keys.sql").exists())
                .isTrue();
    }
}
