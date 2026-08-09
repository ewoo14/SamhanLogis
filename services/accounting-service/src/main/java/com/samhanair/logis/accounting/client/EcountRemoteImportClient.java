package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
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

    public EcountRemoteImportClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            ObjectMapper objectMapper) {
        this.builder = builder;
        this.objectMapper = objectMapper;
    }

    public RemoteImportResult importFile(String serviceName, String endpoint,
                                         Map<String, Path> parts, String userId) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        parts.forEach((partName, path) -> body.add(partName, new FileSystemResource(path)));
        try {
            String response = builder.clone()
                    .baseUrl("http://" + serviceName)
                    .build()
                    .post()
                    .uri(endpoint)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .header(USER_ID_HEADER, normalizeUser(userId))
                    .body(body)
                    .retrieve()
                    .body(String.class);
            return parse(response);
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
            return new RemoteImportResult(
                    intValue(data, "imported") + intValue(data, "updated")
                            + intValue(data, "aliasImported") + intValue(data, "lineAdded"),
                    intValue(data, "rejected") + intValue(data, "rejectedNullName"),
                    textValue(data, "sourceFileHash"),
                    intValue(data, "heldParseFailureRows"),
                    intValue(data, "infrastructureFailureRows"),
                    booleanValue(data, "infrastructureFailure"));
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "외부 이카운트 import 응답 파싱 실패: " + ex.getMessage(), ex);
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
                                     int heldParseFailureRows, int infrastructureFailureRows,
                                     boolean infrastructureFailure) {
        public RemoteImportResult(int imported, int rejected, String sourceFileHash) {
            this(imported, rejected, sourceFileHash, 0, 0, false);
        }
    }
}
