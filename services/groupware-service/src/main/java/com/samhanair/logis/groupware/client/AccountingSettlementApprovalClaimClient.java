package com.samhanair.logis.groupware.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** groupware 첨부가 accounting 정산 claim을 예약·활성화·해제하는 내부 client. */
@Component
public class AccountingSettlementApprovalClaimClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String ACCOUNTING_SERVICE_BASE = "http://accounting-service";
    private static final String CLAIM_PATH = "/internal/accounting/settlement-approval-claims";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public AccountingSettlementApprovalClaimClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this(builder.baseUrl(ACCOUNTING_SERVICE_BASE)
                .requestFactory(timeoutRequestFactory())
                .build(), internalAuthProperties, objectMapper);
    }

    AccountingSettlementApprovalClaimClient(RestClient restClient,
                                            InternalAuthProperties internalAuthProperties,
                                            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    private static SimpleClientHttpRequestFactory timeoutRequestFactory() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return requestFactory;
    }

    /** CONFIRMED 정산서의 결재별 claim을 예약하고 내부 token을 받는다. */
    public UUID reserve(String documentNo, UUID approvalId) {
        String body = restClient.post()
                .uri(CLAIM_PATH)
                .header(INTERNAL_TOKEN_HEADER, token())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("documentNo", documentNo, "approvalId", approvalId))
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> throwRemote(response.getStatusCode()))
                .body(String.class);
        return parseClaimToken(body);
    }

    /** groupware 로컬 첨부 transaction이 준비된 뒤 claim을 ACTIVE로 올린다. */
    public void activate(UUID claimToken) {
        restClient.post()
                .uri(CLAIM_PATH + "/{claimToken}/activate", claimToken)
                .header(INTERNAL_TOKEN_HEADER, token())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> throwRemote(response.getStatusCode()))
                .toBodilessEntity();
    }

    /** 첨부 실패·삭제의 보상 해제. */
    public void release(UUID claimToken) {
        restClient.delete()
                .uri(CLAIM_PATH + "/{claimToken}", claimToken)
                .header(INTERNAL_TOKEN_HEADER, token())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> throwRemote(response.getStatusCode()))
                .toBodilessEntity();
    }

    /** 반려·회수 시 결재선의 모든 정산 claim을 해제한다. */
    public void releaseByApproval(UUID approvalId) {
        restClient.delete()
                .uri(CLAIM_PATH + "/by-approval/{approvalId}", approvalId)
                .header(INTERNAL_TOKEN_HEADER, token())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> throwRemote(response.getStatusCode()))
                .toBodilessEntity();
    }

    private UUID parseClaimToken(String body) {
        try {
            JsonNode token = objectMapper.readTree(body).path("data").path("claimToken");
            if (!token.isTextual()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "accounting claim 응답 형식 오류");
            }
            return UUID.fromString(token.asText());
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "accounting claim 응답 형식 오류", ex);
        }
    }

    private String token() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service internal token이 설정되지 않았습니다");
        }
        return token;
    }

    private void throwRemote(HttpStatusCode status) {
        ErrorCode code = status.value() == 409 ? ErrorCode.CONFLICT : ErrorCode.INTERNAL_ERROR;
        throw new BusinessException(code, "accounting-service 결재 claim 호출 실패: " + status);
    }
}
