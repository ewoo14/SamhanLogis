package com.samhanair.logis.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class RoleTest {

    @Test
    void hasTenRoles() {
        assertEquals(10, Role.values().length);
    }

    @Test
    void masterDisplayNameIsKorean() {
        assertEquals("마스터", Role.MASTER.getDisplayName());
    }

    @Test
    void staffDisplayNameIsKorean() {
        assertEquals("사원", Role.STAFF.getDisplayName());
    }

    @Test
    void driverDisplayNameIsKorean() {
        assertEquals("기사", Role.DRIVER.getDisplayName());
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
    void fromAuthorityResolvesStaff() {
        assertEquals(Role.STAFF, Role.fromAuthority("ROLE_STAFF"));
    }

    @Test
    void fromAuthorityResolvesDriver() {
        assertEquals(Role.DRIVER, Role.fromAuthority("ROLE_DRIVER"));
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
