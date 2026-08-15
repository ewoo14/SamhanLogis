package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Import;

class ArologisGatewayAttestationContractTest {

    @Test
    void abstractPostgresItUsesSharedGatewayAttestationConfigAndFailsClosedWhenBlank() {
        Import imported = AbstractPostgresIT.class.getAnnotation(Import.class);

        assertThat(imported).isNotNull();
        assertThat(imported.value()).containsExactly(GatewayAttestationMockMvcConfig.class);

        new ApplicationContextRunner()
                .withUserConfiguration(imported.value())
                .withPropertyValues("SAMHAN_GATEWAY_ATTESTATION=")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .hasRootCauseInstanceOf(IllegalStateException.class)
                            .rootCause()
                            .message()
                            .contains("SAMHAN_GATEWAY_ATTESTATION");
                });
    }
}
