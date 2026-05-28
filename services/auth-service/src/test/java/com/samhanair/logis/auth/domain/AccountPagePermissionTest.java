package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountPagePermissionTest {

    @Test
    void allowsReflectsColumns() {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        AccountPagePermission permission = AccountPagePermission.of(accountId, "accounting.journals");

        permission.grant(PermissionAction.CREATE);

        assertThat(permission.allows(PermissionAction.CREATE)).isTrue();
        assertThat(permission.allows(PermissionAction.DELETE)).isFalse();
    }

    @Test
    void revokeClearsOnlySelectedAction() {
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        AccountPagePermission permission = AccountPagePermission.of(accountId, "accounting.journals");

        permission.grant(PermissionAction.VIEW);
        permission.grant(PermissionAction.DOWNLOAD);
        permission.revoke(PermissionAction.DOWNLOAD);

        assertThat(permission.allows(PermissionAction.VIEW)).isTrue();
        assertThat(permission.allows(PermissionAction.DOWNLOAD)).isFalse();
    }
}
