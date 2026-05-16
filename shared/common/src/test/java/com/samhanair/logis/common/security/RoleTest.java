package com.samhanair.logis.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class RoleTest {

    @Test
    void hasEightRoles() {
        assertEquals(8, Role.values().length);
    }

    @Test
    void masterDisplayNameIsKorean() {
        assertEquals("마스터", Role.MASTER.getDisplayName());
    }

    @Test
    void fromAuthorityResolvesSales() {
        assertEquals(Role.SALES, Role.fromAuthority("ROLE_SALES"));
    }

    @Test
    void fromAuthorityResolvesDispatch() {
        assertEquals(Role.DISPATCH, Role.fromAuthority("ROLE_DISPATCH"));
    }

    @Test
    void fromAuthorityRejectsBareName() {
        assertThrows(IllegalArgumentException.class, () -> Role.fromAuthority("BOGUS"));
    }

    @Test
    void fromAuthorityRejectsUnknownRole() {
        assertThrows(IllegalArgumentException.class, () -> Role.fromAuthority("ROLE_NOPE"));
    }

    @Test
    void fromAuthorityRejectsNull() {
        assertThrows(IllegalArgumentException.class, () -> Role.fromAuthority(null));
    }
}
