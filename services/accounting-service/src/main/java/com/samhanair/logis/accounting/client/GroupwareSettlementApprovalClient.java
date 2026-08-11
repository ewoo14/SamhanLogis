package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** groupware-service의 정산서 참조 결재 활성 여부를 조회하는 내부 client. */
@Component
public class GroupwareSettlementApprovalClient {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String GROUPWARE_SERVICE_BASE = "http://groupware-service";
    private static final String ACTIVE_APPROVAL_PATH = "/internal/groupware/settlement-approvals/active";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public GroupwareSettlementApprovalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this(builder.baseUrl(GROUPWARE_SERVICE_BASE).build(), internalAuthProperties, objectMapper);
    }

    GroupwareSettlementApprovalClient(RestClient restClient,
                                      InternalAuthProperties internalAuthProperties,
                                      ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** 정산서 번호에 진행 중이거나 완료된 결재 첨부가 있는지 조회한다. */
    public boolean hasActiveSettlementApproval(String documentNo) {
        if (documentNo == null || documentNo.isBlank()) {
            throw new IllegalArgumentException("documentNo 는 필수입니다");
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "groupware-service internal token이 설정되지 않았습니다");
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path(ACTIVE_APPROVAL_PATH)
                            .queryParam("documentNo", documentNo.trim()).build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, response) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "groupware-service 결재 상태 조회 실패: " + response.getStatusCode());
                    })
                    .body(String.class);
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.path("data");
            if (!data.isBoolean()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "groupware-service 결재 상태 응답 형식 오류");
            }
            return data.asBoolean();
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "groupware-service 결재 상태 조회 실패", ex);
        }
    }
}
