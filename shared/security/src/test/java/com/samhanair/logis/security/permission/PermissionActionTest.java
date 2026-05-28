package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PermissionActionTest {

    @Test
    void hasSevenActions() {
        assertThat(PermissionAction.values()).hasSize(7);
    }

    @Test
    void parsesCaseInsensitive() {
        assertThat(PermissionAction.from("view")).isEqualTo(PermissionAction.VIEW);
        assertThat(PermissionAction.from("DOWNLOAD")).isEqualTo(PermissionAction.DOWNLOAD);
    }

    @Test
    void rejectsUnknown() {
        assertThat(PermissionAction.fromOrNull("EDIT")).isNull();
    }
}
