package com.samhanair.logis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ActorDisplayNameTest {

    private static final String ACTOR_UUID = "123e4567-e89b-12d3-a456-426614174000";

    @Test
    void uuid_caller_without_name_uses_unknown_display_name() {
        assertThat(ActorDisplayName.resolve(ACTOR_UUID, null))
                .isEqualTo("변경자 미상");
    }

    @Test
    void uuid_name_header_is_not_returned_as_display_name() {
        assertThat(ActorDisplayName.resolve(ACTOR_UUID, ACTOR_UUID))
                .isEqualTo("변경자 미상");
    }

    @Test
    void known_name_is_preserved_verbatim() {
        assertThat(ActorDisplayName.resolve(ACTOR_UUID, "김감사"))
                .isEqualTo("김감사");
    }

    @Test
    void system_actor_keeps_system_display_even_when_name_header_is_present() {
        assertThat(ActorDisplayName.resolve("00000000-0000-0000-0000-000000000000", "김감사"))
                .isEqualTo("system");
    }

    @Test
    void invisible_wrapped_uuid_is_not_accepted_as_a_display_name() {
        assertThat(ActorDisplayName.resolve(ACTOR_UUID, "\u200B" + ACTOR_UUID + "\u200B"))
                .isEqualTo("변경자 미상");
    }

    @Test
    void legacy_non_uuid_caller_id_remains_available_when_name_is_missing() {
        assertThat(ActorDisplayName.resolve("employee-17", null))
                .isEqualTo("employee-17");
    }

    @Test
    void nullable_revision_resolution_does_not_invent_unknown_label() {
        assertThat(ActorDisplayName.resolveNullable(ACTOR_UUID, null)).isNull();
        assertThat(ActorDisplayName.resolveNullable(ACTOR_UUID, "김감사"))
                .isEqualTo("김감사");
    }
}
