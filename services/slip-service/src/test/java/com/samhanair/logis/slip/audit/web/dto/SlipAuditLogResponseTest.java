package com.samhanair.logis.slip.audit.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SlipAuditLogResponseTest {

    @Test
    void from_hidesLegacyUuidActorNameWithNeutralLabel() {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(),
                "550e8400-e29b-41d4-a716-446655440000", null,
                "memo", "이전", "이후");

        assertThat(SlipAuditLogResponse.from(log).actorName()).isEqualTo("변경자 미상");
    }

    @Test
    void from_preservesNormalActorName() {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(),
                "[DEV-SEED] 개발영업", null, "memo", "이전", "이후");

        assertThat(SlipAuditLogResponse.from(log).actorName()).isEqualTo("[DEV-SEED] 개발영업");
    }

    @Test
    void from_preservesUuidLikeButNonCanonicalActorName() {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(),
                "1-1-1-1-1", null, "memo", "이전", "이후");

        assertThat(SlipAuditLogResponse.from(log).actorName()).isEqualTo("1-1-1-1-1");
    }
}
