package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class EcountRemoteImportClientTest {

    @Test
    void parse_파트너_응답의_보류와_인프라_필드를_버리지_않는다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper()).parse("""
                        {"data":{"imported":0,"updated":0,"rejected":0,
                        "heldParseFailureRows":1,"infrastructureFailureRows":2,
                        "infrastructureFailure":true,"sourceFileHash":"HASH"}}
                        """);

        assertThat(result.heldParseFailureRows()).isEqualTo(1);
        assertThat(result.infrastructureFailureRows()).isEqualTo(2);
        assertThat(result.infrastructureFailure()).isTrue();
    }
}
