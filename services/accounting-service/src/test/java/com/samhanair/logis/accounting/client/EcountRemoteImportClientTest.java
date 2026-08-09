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

    @Test
    void parse_파트너_heldSample의_사유와_행_식별자를_보존한다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper()).parse("""
                        {"data":{"imported":2,"updated":1,"heldParseFailureRows":2,
                        "heldSample":[
                          {"rowNumber":4,"reason":"INPUT_VALIDATION","rawPartnerCode":"R14-NEG","rawName":"음수"},
                          {"rowNumber":5,"reason":"DB_CONSTRAINT","rawPartnerCode":"R14-DUP","rawName":"중복"}
                        ]}}
                        """);

        assertThat(result.heldSample()).containsExactly(
                new com.samhanair.logis.common.ecount.EcountReimportResult.HeldSample(
                        4, "INPUT_VALIDATION", "R14-NEG", "음수"),
                new com.samhanair.logis.common.ecount.EcountReimportResult.HeldSample(
                        5, "DB_CONSTRAINT", "R14-DUP", "중복"));
    }

    @Test
    void parse_heldSample이_없으면_빈_목록이다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper()).parse("{\"data\":{\"imported\":1}}");

        assertThat(result.heldSample()).isEmpty();
    }
}
