package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.time.Duration;
import com.samhanair.logis.common.ecount.EcountReimportResult;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * MIG-20 accounting-service 밖에 있는 기존 이카운트 import endpoint 호출 client.
 *
 * <p>Phase C5-4: X-User-Role 헤더 주입 제거.
 * 수신측(product-service 등) HeaderAuthenticationFilter 는 X-User-Id 단독으로 인증 성립 (C5-3).
 * 호출 경로({@code /admin/products/imports/ecount} 등)는 {@code /internal/} prefix 아님 →
 * InternalTokenFilter no-op 통과. X-User-Id 주입으로 인증 유지. role 인가는 @RequirePermission
 * AOP 가 DynamicPermissionClient 로 처리하므로 별도 X-User-Role 불필요.
 */
@Component
public class EcountRemoteImportClient {

    private static final String USER_ID_HEADER = "X-User-Id";

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;

    @Autowired
    public EcountRemoteImportClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            ObjectMapper objectMapper) {
        this(builder, objectMapper, true);
    }

    /** 운영 원격 적재는 partner의 행별 처리 시간이 길어도 응답을 끝까지 읽는다. */
    public EcountRemoteImportClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            ObjectMapper objectMapper, boolean productionTimeouts) {
        this.builder = productionTimeouts ? builder.clone().requestFactory(timeoutRequestFactory()) : builder;
        this.objectMapper = objectMapper;
    }

    static SimpleClientHttpRequestFactory timeoutRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofMinutes(20).toMillis());
        return factory;
    }

    public RemoteImportResult importFile(String serviceName, String endpoint,
                                         Map<String, Path> parts, String userId) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        parts.forEach((partName, path) -> body.add(partName, new FileSystemResource(path)));
        try {
            String responseText = builder.clone()
                    .baseUrl("http://" + serviceName)
                    .build()
                    .post()
                    .uri(endpoint)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .header(USER_ID_HEADER, normalizeUser(userId))
                    .body(body)
                    .exchange((request, clientResponse) -> {
                        String bodyText = new String(clientResponse.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        if (clientResponse.getStatusCode().isError()) {
                            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                                    "외부 이카운트 import 호출 실패: service=" + serviceName
                                            + ", endpoint=" + endpoint + ", status="
                                            + clientResponse.getStatusCode().value() + ", body=" + bodyText);
                        }
                        return bodyText;
                    });
            return parse(responseText);
        } catch (RestClientResponseException ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "외부 이카운트 import 호출 실패: service=" + serviceName
                            + ", endpoint=" + endpoint + ", status=" + ex.getStatusCode().value()
                            + ", body=" + ex.getResponseBodyAsString(), ex);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "외부 이카운트 import 호출 실패: service=" + serviceName
                            + ", endpoint=" + endpoint + ", message=" + ex.getMessage(), ex);
        }
    }

    RemoteImportResult parse(String response) {
        try {
            JsonNode root = response == null || response.isBlank() ? objectMapper.createObjectNode()
                    : objectMapper.readTree(response);
            JsonNode data = root.has("data") ? root.get("data") : root;
            List<EcountReimportResult.HeldSample> heldSample = new ArrayList<>();
            List<EcountReimportResult.HeldSample> rejectedSample = new ArrayList<>();
            JsonNode held = data == null ? null : data.get("heldSample");
            if (held != null && held.isArray()) {
                readSamples(held, heldSample);
            }
            JsonNode rejected = data == null ? null : data.get("rejectedSample");
            if (rejected != null && rejected.isArray()) {
                readSamples(rejected, rejectedSample);
            }
            JsonNode infrastructure = data == null ? null : data.get("infrastructureFailureSample");
            if (infrastructure != null && infrastructure.isArray()) {
                readSamples(infrastructure, rejectedSample);
            }
            return new RemoteImportResult(
                    intValue(data, "imported") + intValue(data, "updated")
                            + intValue(data, "aliasImported") + intValue(data, "lineAdded"),
                    intValue(data, "rejected") + intValue(data, "rejectedNullName"),
                    textValue(data, "sourceFileHash"),
                    intValue(data, "heldParseFailureRows"),
                    heldSample,
                    rejectedSample,
                    intValue(data, "infrastructureFailureRows"),
                    booleanValue(data, "infrastructureFailure"));
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "외부 이카운트 import 응답 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    private static void readSamples(JsonNode source, List<EcountReimportResult.HeldSample> target) {
        for (JsonNode sample : source) {
            target.add(new EcountReimportResult.HeldSample(
                    intValue(sample, "rowNumber"), textValue(sample, "reason"),
                    textValue(sample, "rawPartnerCode"), textValue(sample, "rawName")));
        }
    }

    private static int intValue(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || !value.canConvertToInt() ? 0 : value.asInt();
    }

    private static String textValue(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static boolean booleanValue(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value != null && value.isBoolean() && value.asBoolean();
    }

    private static String normalizeUser(String userId) {
        return userId == null || userId.isBlank() ? "system" : userId;
    }

    public record RemoteImportResult(int imported, int rejected, String sourceFileHash,
                                     int heldParseFailureRows,
                                     List<EcountReimportResult.HeldSample> heldSample,
                                     List<EcountReimportResult.HeldSample> rejectedSample,
                                     int infrastructureFailureRows, boolean infrastructureFailure) {
        public RemoteImportResult(int imported, int rejected, String sourceFileHash,
                                   int heldParseFailureRows,
                                   List<EcountReimportResult.HeldSample> heldSample,
                                   int infrastructureFailureRows, boolean infrastructureFailure) {
            this(imported, rejected, sourceFileHash, heldParseFailureRows, heldSample,
                    List.of(), infrastructureFailureRows, infrastructureFailure);
        }

        public RemoteImportResult(int imported, int rejected, String sourceFileHash,
                                   int heldParseFailureRows, int infrastructureFailureRows,
                                   boolean infrastructureFailure) {
            this(imported, rejected, sourceFileHash, heldParseFailureRows, List.of(),
                    List.of(), infrastructureFailureRows, infrastructureFailure);
        }

        public RemoteImportResult(int imported, int rejected, String sourceFileHash) {
            this(imported, rejected, sourceFileHash, 0, List.of(), List.of(), 0, false);
        }
    }
}
