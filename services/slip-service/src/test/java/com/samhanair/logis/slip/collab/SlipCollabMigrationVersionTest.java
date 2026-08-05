package com.samhanair.logis.slip.collab;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class SlipCollabMigrationVersionTest {

    private static final int HIGHEST_VERSION_APPLIED_IN_EXISTING_SLIP_DB = 105;
    private static final int HIGHEST_VERSION_RESERVED_BY_OPEN_PR_1045 = 107;
    private static final int OUTBOX_MIGRATION_VERSION = 110;

    @Test
    void outboxMigrationIsAfterExistingDatabaseAndOpenPrVersions() {
        assertThat(OUTBOX_MIGRATION_VERSION)
                .isGreaterThan(HIGHEST_VERSION_APPLIED_IN_EXISTING_SLIP_DB)
                .isGreaterThan(HIGHEST_VERSION_RESERVED_BY_OPEN_PR_1045);
        assertThat(new ClassPathResource(
                "db/migration/V110__index_collab_notification_event.sql").exists())
                .isTrue();
    }
}
