package com.samhanair.logis.slip.collab;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class SlipCollabMigrationVersionTest {

    private static final int HIGHEST_VERSION_APPLIED_IN_EXISTING_SLIP_DB = 105;
    private static final int HIGHEST_VERSION_RESERVED_BY_OPEN_PR_1045 = 107;
    private static final int OUTBOX_MIGRATION_VERSION = 109;

    @Test
    void outboxMigrationIsAfterExistingDatabaseAndOpenPrVersions() {
        assertThat(OUTBOX_MIGRATION_VERSION)
                .isGreaterThan(HIGHEST_VERSION_APPLIED_IN_EXISTING_SLIP_DB)
                .isGreaterThan(HIGHEST_VERSION_RESERVED_BY_OPEN_PR_1045);
        assertThat(new ClassPathResource(
                "db/migration/V109__make_collab_notification_event_scoped.sql").exists())
                .isTrue();
    }
}
