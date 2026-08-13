package com.samhanair.logis.dashboard.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AppClientTypeContractTest {

    @Test
    void canonicalClientTypesContainTheNineShippableApps() {
        assertThat(AppClientType.values())
                .extracting(Enum::name)
                .containsExactly(
                        "DESKTOP",
                        "SAMHAN_MOBILE",
                        "SAMHAN_MOBILE_STAFF",
                        "AROLOGIS_MOBILE",
                        "SAMHAN_ORDER_WEB",
                        "SAMHAN_ESTIMATE_WEB",
                        "SAMHAN_MOBILE_PUBLIC_WEB",
                        "AROLOGIS_DESKTOP",
                        "INTERNAL_CHAT_DESKTOP",
                        "WEB",
                        "MOBILE");
    }
}
