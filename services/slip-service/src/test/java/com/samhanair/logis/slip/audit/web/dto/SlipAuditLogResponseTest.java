package com.samhanair.logis.slip.audit.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SlipAuditLogResponseTest {

    @Test
    void from_hidesLegacyUuidActorNameWithNeutralLabel() {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(),
                "550e8400-e29b-41d4-a716-446655440000", null,
                "memo", "이전", "이후");

        assertThat(SlipAuditLogResponse.from(log).actorName()).isEqualTo("변경자 미상");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{550e8400-e29b-41d4-a716-446655440000}",
            "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
            "550e8400e29b41d4a716446655440000"
    })
    void from_hidesR15NonCanonicalUuidActorNames(String actorName) {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(), actorName, null,
                "memo", "이전", "이후");

        assertThat(SlipAuditLogResponse.from(log).actorName()).isEqualTo("변경자 미상");
    }

    @Test
    void from_hidesUppercaseAndPaddedCanonicalUuidActorName() {
        SlipAuditLog log = SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(),
                "  550E8400-E29B-41D4-A716-446655440000  ", null,
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

    @Test
    void from_preserves32CharacterNonUuidDisplayNames() {
        String koreanName = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도루";
        String alphaNumericName = "0000000000000000000000000000000G";

        assertThat(SlipAuditLogResponse.from(SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(), koreanName, null,
                "memo", "이전", "이후")).actorName()).isEqualTo(koreanName);
        assertThat(SlipAuditLogResponse.from(SlipAuditLog.record(
                UUID.randomUUID(), 1, UUID.randomUUID(), alphaNumericName, null,
                "memo", "이전", "이후")).actorName()).isEqualTo(alphaNumericName);
    }
}
