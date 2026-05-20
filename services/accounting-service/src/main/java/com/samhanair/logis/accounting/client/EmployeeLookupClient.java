package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** user-service internal Employee name lookup client. 200 empty 는 miss, 호출 실패는 MIG10 lookup error 로 분리한다. */
@Component
public class EmployeeLookupClient {

    private static final Logger log = LoggerFactory.getLogger(EmployeeLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_SERVICE_BASE = "http://user-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public EmployeeLookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                InternalAuthProperties internalAuthProperties,
                                ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(USER_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    public List<EmployeeLookupResult> findByFullName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return List.of();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("EmployeeLookupClient — X-Internal-Token 미설정, lookup skip (fullName={})", fullName);
            return List.of();
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/users/by-name")
                            .queryParam("name", fullName.trim())
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseResults(body);
        } catch (RestClientResponseException ex) {
            log.warn("EmployeeLookupClient — fullName={} status={}", fullName, ex.getStatusCode().value());
            throw new BusinessException(ErrorCode.MIG10_EMPLOYEE_LOOKUP_ERROR,
                    "user-service Employee lookup 실패: status=" + ex.getStatusCode().value(), ex);
        } catch (Exception ex) {
            log.warn("EmployeeLookupClient 호출 실패 — fullName={}, msg={}", fullName, ex.getMessage());
            throw new BusinessException(ErrorCode.MIG10_EMPLOYEE_LOOKUP_ERROR,
                    "user-service Employee lookup 호출 실패", ex);
        }
    }

    private List<EmployeeLookupResult> parseResults(String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                return List.of();
            }
            List<EmployeeLookupResult> results = new ArrayList<>();
            for (JsonNode item : data) {
                UUID id = parseUuid(item, "employeeId", "id", "userId");
                String name = textOrNull(item, "fullName", "name");
                if (id != null && name != null && !name.isBlank()) {
                    results.add(new EmployeeLookupResult(id, name));
                }
            }
            return List.copyOf(results);
        } catch (Exception ex) {
            log.warn("EmployeeLookupClient response 파싱 실패 — bodyLen={}, msg={}", body.length(), ex.getMessage());
            return List.of();
        }
    }

    private static String textOrNull(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && !value.isNull() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }

    private static UUID parseUuid(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && !value.isNull() && !value.asText().isBlank()) {
                try {
                    return UUID.fromString(value.asText());
                } catch (IllegalArgumentException ignore) {
                    return null;
                }
            }
        }
        return null;
    }
}
