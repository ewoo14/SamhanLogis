package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.test.web.client.response.MockRestResponseCreators;
import org.springframework.web.client.RestClient;
import org.junit.jupiter.api.Test;

class EcountRemoteImportClientTest {

    @Test
    void importFile_application_octet_stream_JSON도_정상_파싱한다() throws Exception {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(MockRestRequestMatchers.requestTo("http://partner-service/admin/partners/imports/ecount"))
                .andRespond(MockRestResponseCreators.withSuccess(
                        "{\"imported\":2,\"rejectedNullName\":0}",
                        MediaType.APPLICATION_OCTET_STREAM));
        var file = Files.createTempFile("r16", ".csv");
        Files.writeString(file, "payload");

        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                builder, new ObjectMapper(), false).importFile("partner-service",
                        "/admin/partners/imports/ecount", java.util.Map.of("file", file), "tester");

        assertThat(result.imported()).isEqualTo(2);
        server.verify();
    }

    @Test
    void parse_파트너_응답의_보류와_인프라_필드를_버리지_않는다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper(), false).parse("""
                        {"data":{"imported":0,"updated":0,"rejected":0,
                        "heldParseFailureRows":1,"infrastructureFailureRows":2,
                        "infrastructureFailure":true,"sourceFileHash":"HASH",
                        "infrastructureFailureSample":[{"rowNumber":9,"reason":"DB_INFRASTRUCTURE","rawPartnerCode":"R16-INFRA","rawName":"infra"}]}}
                        """);

        assertThat(result.heldParseFailureRows()).isEqualTo(1);
        assertThat(result.infrastructureFailureRows()).isEqualTo(2);
        assertThat(result.infrastructureFailure()).isTrue();
        assertThat(result.rejectedSample()).containsExactly(
                new com.samhanair.logis.common.ecount.EcountReimportResult.HeldSample(
                        9, "DB_INFRASTRUCTURE", "R16-INFRA", "infra"));
    }

    @Test
    void parse_파트너_heldSample의_사유와_행_식별자를_보존한다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper(), false).parse("""
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
                null, new ObjectMapper(), false).parse("{\"data\":{\"imported\":1}}");

        assertThat(result.heldSample()).isEmpty();
    }

    @Test
    void parse_거부채널의_행과_사유도_보존한다() {
        EcountRemoteImportClient.RemoteImportResult result = new EcountRemoteImportClient(
                null, new ObjectMapper(), false).parse("""
                        {"data":{"rejectedNullName":1,"rejectedSample":[
                          {"rowNumber":3,"reason":"REJECT_NAME_NULL","rawPartnerCode":"R16-BLANK","rawName":""}
                        ]}}
                        """);

        assertThat(result.rejectedSample()).containsExactly(
                new com.samhanair.logis.common.ecount.EcountReimportResult.HeldSample(
                        3, "REJECT_NAME_NULL", "R16-BLANK", ""));
    }
}
