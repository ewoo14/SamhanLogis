package com.samhanair.logis.arologis.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.client.SlipClient.SignaturePayload;
import com.samhanair.logis.arologis.client.SlipClient.UploadedAttachment;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * SlipClient 단위 검증 — Phase 10 W10-4 종합 TM (QA-1 채택) 신규.
 *
 * <p>RestClient + MockRestServiceServer 로 slip-service 호출 시나리오 검증:
 * <ul>
 *   <li>skeleton-mode true → 외부 호출 회피 (Optional.empty / false)</li>
 *   <li>skeleton-mode false + 200 ApiResponse wrapper → 정상 동작 (UUID parsing / true 반환)</li>
 *   <li>skeleton-mode false + 5xx → graceful empty / false (운영 영향 0)</li>
 *   <li>by-partner-code 200 + data=null → empty Optional (graceful 매핑 실패)</li>
 * </ul>
 */
class SlipClientTest {

    private static final String BASE_URL = "http://slip-service-stub";
    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final UUID SLIP_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    // ---------- skeleton-mode true (호출 회피) ----------

    @Test
    void registerSignature_skeletonModeTrue_returnsFalse() {
        SlipClient client = new SlipClient(RestClient.builder(), new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, true);
        boolean result = client.registerSignature(SLIP_ID, payload());
        assertThat(result).isFalse();
    }

    @Test
    void findRecentSlipIdByPartnerCode_skeletonModeTrue_returnsEmpty() {
        SlipClient client = new SlipClient(RestClient.builder(), new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, true);
        Optional<UUID> result = client.findRecentSlipIdByPartnerCode("214");
        assertThat(result).isEmpty();
    }

    @Test
    void uploadAttachment_skeletonModeTrue_returnsEmpty() {
        SlipClient client = new SlipClient(RestClient.builder(), new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, true);
        Optional<UploadedAttachment> result = client.uploadAttachment(
                SLIP_ID, "DELIVERY", file(), null, null, null, "DR-001");
        assertThat(result).isEmpty();
    }

    // ---------- skeleton-mode false + 정상 200 ----------

    @Test
    void registerSignature_success200_returnsTrue() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        // ApiResponse wrapper schema (success=true)
        String body = "{\"success\":true,\"data\":{\"slipId\":\"" + SLIP_ID + "\",\"slipNo\":\"2026/05/07-1\","
                + "\"signatureSource\":\"APP\",\"signed\":true,\"driverSigned\":false}}";
        server.expect(requestTo(BASE_URL + "/internal/slips/" + SLIP_ID + "/signatures"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        boolean result = client.registerSignature(SLIP_ID, payload());
        assertThat(result).isTrue();
        server.verify();
    }

    @Test
    void findRecentSlipIdByPartnerCode_success200_returnsSlipId() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        String body = "{\"success\":true,\"data\":{\"slipId\":\"" + SLIP_ID + "\",\"slipNo\":\"2026/05/07-1\","
                + "\"status\":\"INSPECTING\"}}";
        server.expect(requestTo(BASE_URL + "/internal/slips/by-partner-code/214/recent"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        Optional<UUID> result = client.findRecentSlipIdByPartnerCode("214");
        assertThat(result).isPresent().contains(SLIP_ID);
        server.verify();
    }

    @Test
    void uploadAttachment_postsMultipartWithInternalTokenAndParsesCompactResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        LocalDateTime capturedAt = LocalDateTime.of(2026, 5, 15, 13, 30);
        LocalDateTime uploadedAt = LocalDateTime.of(2026, 5, 15, 13, 31);
        String body = """
                {"success":true,"data":{
                  "id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                  "slipId":"11111111-2222-3333-4444-555555555555",
                  "attachmentType":"DELIVERY",
                  "fileName":"delivery-proof.jpg",
                  "fileSize":4,
                  "contentType":"image/jpeg",
                  "capturedAt":"2026-05-15T13:30:00",
                  "uploadedAt":"2026-05-15T13:31:00",
                  "downloadUrl":"https://storage.local/private"
                }}""";

        server.expect(requestTo(BASE_URL + "/internal/slips/" + SLIP_ID + "/attachments"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
                .andExpect(content().string(containsString("name=\"type\"")))
                .andExpect(content().string(containsString("DELIVERY")))
                .andExpect(content().string(containsString("name=\"uploadedBy\"")))
                .andExpect(content().string(containsString("DR-001")))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        Optional<UploadedAttachment> result = client.uploadAttachment(
                SLIP_ID, "DELIVERY", file(),
                new BigDecimal("37.4979000"), new BigDecimal("127.0276000"),
                capturedAt, "DR-001");

        assertThat(result).contains(new UploadedAttachment(
                "DELIVERY", "delivery-proof.jpg", 4L, "image/jpeg", capturedAt, uploadedAt));
        server.verify();
    }

    // ---------- skeleton-mode false + graceful empty (200 + data=null) ----------

    @Test
    void findRecentSlipIdByPartnerCode_200WithNullData_returnsEmpty() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        // BE-1 채택 — graceful empty 패턴 (200 + data=null)
        String body = "{\"success\":true,\"data\":null}";
        server.expect(requestTo(BASE_URL + "/internal/slips/by-partner-code/UNKNOWN/recent"))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        Optional<UUID> result = client.findRecentSlipIdByPartnerCode("UNKNOWN");
        assertThat(result).isEmpty();
        server.verify();
    }

    // ---------- skeleton-mode false + 5xx graceful fallback ----------

    @Test
    void registerSignature_5xx_returnsFalse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        server.expect(requestTo(BASE_URL + "/internal/slips/" + SLIP_ID + "/signatures"))
                .andRespond(withServerError());

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        boolean result = client.registerSignature(SLIP_ID, payload());
        assertThat(result).isFalse();   // graceful fallback (운영 영향 0)
        server.verify();
    }

    @Test
    void findRecentSlipIdByPartnerCode_5xx_returnsEmpty() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        server.expect(requestTo(BASE_URL + "/internal/slips/by-partner-code/214/recent"))
                .andRespond(withServerError());

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        Optional<UUID> result = client.findRecentSlipIdByPartnerCode("214");
        assertThat(result).isEmpty();
        server.verify();
    }

    @Test
    void uploadAttachment_5xx_returnsEmpty() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        server.expect(requestTo(BASE_URL + "/internal/slips/" + SLIP_ID + "/attachments"))
                .andRespond(withServerError());

        SlipClient client = new SlipClient(builder, new ObjectMapper(),
                BASE_URL, INTERNAL_TOKEN, false);
        Optional<UploadedAttachment> result = client.uploadAttachment(
                SLIP_ID, "INSPECTION", file(), null, null, null, "DR-001");
        assertThat(result).isEmpty();
        server.verify();
    }

    // ---------- helpers ----------

    private SignaturePayload payload() {
        return SignaturePayload.appDriver(
                "s3://samhan-prod/sig.png",
                "INSUNG-001",
                LocalDateTime.now(),
                new BigDecimal("37.5"),
                new BigDecimal("127.0"));
    }

    private MockMultipartFile file() {
        return new MockMultipartFile(
                "file", "delivery-proof.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});
    }
}
