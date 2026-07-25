package com.samhanair.logis.inventory.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Internal-token-authenticated client to {@code slip-service} 의 슬립 상세 조회 endpoint.
 *
 * <p>inventory-service 의 입고 검수 슬라이스(P0-9) 에서 슬립 헤더 + 라인 정보를 조회하기 위해 사용.
 * X-Internal-Token 및 gateway 신뢰 헤더로 인증 (SAMHAN_INTERNAL_TOKEN env).
 *
 * <p>HTTP 상태 매핑:
 * <ul>
 *   <li>404 → BusinessException(NOT_FOUND)</li>
 *   <li>403 → BusinessException(FORBIDDEN)</li>
 *   <li>기타 4xx → BusinessException(INVALID_INPUT)</li>
 *   <li>5xx / 연결 실패 → BusinessException(INTERNAL_ERROR)</li>
 * </ul>
 */
@Component
public class SlipClient {

    private static final Logger log = LoggerFactory.getLogger(SlipClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String INTERNAL_CALLER_ID = "system-internal";
    private static final String INTERNAL_CALLER_ROLE = "MASTER";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public SlipClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                      InternalAuthProperties internalAuthProperties,
                      ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(SLIP_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * slip-service 의 {@code GET /slips/{slipId}} 를 호출해 슬립 상세를 조회한다.
     * X-Internal-Token 및 gateway 신뢰 헤더로 인증.
     *
     * <p>주의: slip-service {@code SlipController} 는 {@code @RequestMapping("/slips")} 로
     * 등록되어 있다 (api-gateway 의 {@code StripPrefix=2} 후 매칭). 본 클라이언트는
     * {@code lb://slip-service} 직접 호출이므로 gateway prefix 를 붙이지 않는다.
     * 해당 public 상세 endpoint 는 Spring Security {@code HeaderAuthenticationFilter} 와
     * 매입/매출 조회 guard 를 통과해야 하므로 internal token 외에 system-master 헤더를 함께 보낸다.
     *
     * <p>응답 envelope ({@code ApiResponse}) 의 {@code data} 키에서 슬립 정보를 추출하여
     * {@link SlipDetail} 로 변환한다. 라인 공급가액도 함께 전달해 권위 금액 라인의 VAT 제외
     * 원가를 downstream 이 계산할 수 있게 한다.
     *
     * @param slipId 슬립 UUID
     * @return 슬립 상세 정보
     * @throws BusinessException(NOT_FOUND) 슬립을 찾을 수 없을 때 (404)
     * @throws BusinessException(FORBIDDEN) slip-service 가 403 반환 시
     * @throws BusinessException(INVALID_INPUT) slip-service 가 기타 4xx 반환 시
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx / 연결 실패 / 응답 포맷 오류
     */
    public SlipDetail getSlip(UUID slipId) {
        Map<String, Object> envelope;
        try {
            envelope = restClient.get()
                    .uri("/slips/{slipId}", slipId)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
                    .header(USER_ROLE_HEADER, INTERNAL_CALLER_ROLE)
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .retrieve()
                    .onStatus(status -> status.value() == 404, (req, res) -> {
                        throw new BusinessException(ErrorCode.NOT_FOUND,
                                "슬립을 찾을 수 없습니다: " + slipId);
                    })
                    .onStatus(status -> status.value() == 403, (req, res) -> {
                        throw new BusinessException(ErrorCode.FORBIDDEN,
                                "slip-service 조회 권한이 없습니다: " + slipId);
                    })
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 조회 실패: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipClient.getSlip failed: slipId={}, error={}", slipId, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 호출 실패", ex);
        }

        return parseSlipDetail(envelope, slipId);
    }

    private SlipDetail parseSlipDetail(Map<String, Object> envelope, UUID slipId) {
        if (envelope == null || !envelope.containsKey("data")) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 응답 포맷 오류 (data 누락)");
        }
        try {
            JsonNode data = objectMapper.convertValue(envelope.get("data"), JsonNode.class);

            UUID id = UUID.fromString(data.get("id").asText());
            String slipNo = data.has("slipNo") ? data.get("slipNo").asText() : null;
            String slipType = data.has("slipType") ? data.get("slipType").asText() : null;
            String status = data.has("status") ? data.get("status").asText() : null;
            UUID destinationWarehouseId = data.has("destinationWarehouseId")
                    && !data.get("destinationWarehouseId").isNull()
                    ? UUID.fromString(data.get("destinationWarehouseId").asText())
                    : null;
            String partnerName = data.has("partnerName")
                    && !data.get("partnerName").isNull()
                    ? data.get("partnerName").asText() : null;
            String destinationWarehouseName = data.has("destinationWarehouseName")
                    && !data.get("destinationWarehouseName").isNull()
                    ? data.get("destinationWarehouseName").asText() : null;
            String slipDate = data.has("slipDate")
                    && !data.get("slipDate").isNull()
                    ? data.get("slipDate").asText() : null;
            // slip-service SlipDetailResponse 의 실 JSON 키는 'businessNumber'(첫 키, 정상 경로).
            // 나머지 키는 향후 다운스트림 필드 rename 대비 fallback(현 응답엔 미존재).
            String businessNumber = textOrNull(data,
                    "businessNumber", "partnerBusinessNo", "bizNo", "businessNo",
                    "businessRegistrationNumber");

            List<SlipLineDetail> lines = new ArrayList<>();
            if (data.has("lines") && data.get("lines").isArray()) {
                for (JsonNode lineNode : data.get("lines")) {
                    UUID lineId = UUID.fromString(lineNode.get("id").asText());
                    UUID productId = lineNode.has("productId") && !lineNode.get("productId").isNull()
                            ? UUID.fromString(lineNode.get("productId").asText()) : null;
                    String productName = lineNode.has("productName")
                            ? lineNode.get("productName").asText() : null;
                    String modelName = lineNode.has("modelName")
                            ? lineNode.get("modelName").asText() : null;
                    int quantity = lineNode.has("quantity")
                            ? lineNode.get("quantity").asInt() : 0;
                    BigDecimal unitPrice = lineNode.has("unitPrice")
                            && !lineNode.get("unitPrice").isNull()
                            ? new BigDecimal(lineNode.get("unitPrice").asText())
                            : BigDecimal.ZERO;
                    BigDecimal supplyAmount = lineNode.has("supplyAmount")
                            && !lineNode.get("supplyAmount").isNull()
                            ? new BigDecimal(lineNode.get("supplyAmount").asText())
                            : null;
                    lines.add(new SlipLineDetail(lineId, productId, productName, modelName,
                            quantity, unitPrice, supplyAmount));
                }
            }

            return new SlipDetail(id, slipNo, slipType, status, destinationWarehouseId,
                    partnerName, destinationWarehouseName, slipDate, businessNumber, lines);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("SlipClient parseSlipDetail error: slipId={}", slipId, ex);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 응답 파싱 실패");
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
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
}
