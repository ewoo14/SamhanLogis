package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class InboundQrLifecycleTest {

    @Test
    void allowsOnlyInboundQrAllowlist() {
        assertThat(InboundQrLifecycle.allowsNewQr("PURCHASE")).isTrue();
        assertThat(InboundQrLifecycle.allowsNewQr("BORROW")).isTrue();
        assertThat(InboundQrLifecycle.allowsNewQr("RENTAL_RETURN")).isTrue();
        assertThat(InboundQrLifecycle.allowsNewQr("RETURN")).isFalse();
        assertThat(InboundQrLifecycle.allowsNewQr("DELIVERY_RETURN")).isFalse();
        assertThat(InboundQrLifecycle.allowsNewQr("RETURN_TRIP")).isFalse();
        assertThat(InboundQrLifecycle.allowsNewQr("REENTRY")).isFalse();
        assertThat(InboundQrLifecycle.allowsNewQr("UNKNOWN_NEW_TAG")).isFalse();
    }
}
