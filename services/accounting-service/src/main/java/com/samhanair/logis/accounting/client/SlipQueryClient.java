package com.samhanair.logis.accounting.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * slip-service 판매조회 Internal RestClient.
 *
 * <p>세금계산서 일괄발행 배치에서 사용 — slip-service 의 {@code GET /internal/slips/sales-query}
 * endpoint 를 호출하여 판매조회 결과를 페이지 단위로 전체 fetch 한다.
 *
 * <p>인증: {@code X-Internal-Token} 헤더 (env {@code SAMHAN_INTERNAL_TOKEN}).
 *
 * <p>IT 에서 {@code @MockBean} 격리 필수
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>응답 형식: ApiResponse {@code data.content} 리스트 + {@code data.last} (페이지 끝 여부).
 */
@Component
public class SlipQueryClient {

    private static final Logger log = LoggerFactory.getLogger(SlipQueryClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";
    private static final String SALES_QUERY_PATH = "/internal/slips/sales-query";
    private static final int PAGE_SIZE = 200;

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public SlipQueryClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(SLIP_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 판매조회 전체 데이터 fetch (멀티 페이지 loop).
     *
     * <p>slip-service 가 {@code GET /internal/slips/sales-query?from=&to=&page=&size=}
     * 를 구현하기 전까지는 빈 리스트를 반환할 수 있음 (404 → BusinessException 유발 방지).
     *
     * @param from 조회 시작일 (inclusive)
     * @param to   조회 종료일 (inclusive)
     * @return 판매조회 결과 Map 리스트 (각 row = 슬립 헤더 + 집계 필드)
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public List<Map<String, Object>> fetchAllSalesRows(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        List<Map<String, Object>> result = new ArrayList<>();
        int page = 0;
        boolean last = false;

        while (!last) {
            int currentPage = page;
            try {
                Map<String, Object> apiResp = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path(SALES_QUERY_PATH)
                                .queryParam("from", from.toString())
                                .queryParam("to", to.toString())
                                .queryParam("page", currentPage)
                                .queryParam("size", PAGE_SIZE)
                                .build())
                        .header(INTERNAL_TOKEN_HEADER, requireToken())
                        .retrieve()
                        .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                            log.warn("SlipQueryClient {} 404/4xx — 빈 결과 반환: {}",
                                    SALES_QUERY_PATH, res.getStatusCode());
                        })
                        .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                    "slip-service sales-query 5xx: " + res.getStatusCode());
                        })
                        .body(new ParameterizedTypeReference<Map<String, Object>>() {});

                if (apiResp == null) {
                    break;
                }

                Object dataObj = apiResp.get("data");
                if (!(dataObj instanceof Map<?, ?> dataMap)) {
                    break;
                }

                Object contentObj = dataMap.get("content");
                if (contentObj instanceof List<?> contentList) {
                    for (Object item : contentList) {
                        if (item instanceof Map<?, ?> row) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> typedRow = (Map<String, Object>) row;
                            result.add(typedRow);
                        }
                    }
                }

                Object lastObj = dataMap.get("last");
                last = Boolean.TRUE.equals(lastObj) || contentObj == null
                        || (contentObj instanceof List<?> l && l.isEmpty());
                page++;

            } catch (BusinessException ex) {
                throw ex;
            } catch (RuntimeException ex) {
                log.error("SlipQueryClient {} 호출 실패: {}", SALES_QUERY_PATH, ex.getMessage());
                // slip-service 미구현 시 빈 결과 반환 (배치 preview 에서 빈 데이터로 처리)
                break;
            }
        }
        return result;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }
}
