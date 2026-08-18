package com.samhanair.logis.accounting.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Internal-token 인증 client to {@code slip-service} 의 마감 잠금 endpoint
 * ({@code POST /internal/slips/lock-by-period}).
 *
 * <p>매출 마감 (P2-4) 단계에서 호출:
 *
 * <ol>
 *   <li>회계담당자가 {@code POST /accounting/closings} 실행 (DAILY 또는 MONTHLY)</li>
 *   <li>service 가 본 client 호출 → slip-service 가 [from, to] 범위의
 *       CONFIRMED 슬립 lock_flag=true 처리 + 잠금 건수 반환</li>
 *   <li>service 가 잠금 건수를 {@link com.samhanair.logis.accounting.domain.AccountingPeriod#close} 에 stamp</li>
 * </ol>
 *
 * <p>본 client 는 Layer 4 외부 client 로서 IT 에서 {@code @MockBean} 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>HTTP 상태 매핑:
 *
 * <ul>
 *   <li>lock-by-period 4xx → {@link BusinessException}({@link ErrorCode#CONFLICT})</li>
 *   <li>source line 조회 401/403 → {@link BusinessException}({@link ErrorCode#FORBIDDEN})</li>
 *   <li>source line 조회 404 → {@link BusinessException}({@link ErrorCode#SAS_SOURCE_SLIP_NOT_FOUND})</li>
 *   <li>source line 조회 기타 4xx → {@link BusinessException}({@link ErrorCode#INVALID_INPUT})</li>
 *   <li>5xx / 연결 실패 → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR})</li>
 * </ul>
 *
 * <p>slip-service 에 본 endpoint 가 추가되기 전까지는 slip-service 가 404 반환 가능 →
 * service 는 이를 CONFLICT 로 surface (마감 절차상 명시적 fail).
 */
@Component
public class SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(SlipServiceClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";
    private static final String LOCK_BY_PERIOD_PATH = "/internal/slips/lock-by-period";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public SlipServiceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties,
                             @Value("${app.services.slip-service.base-url:http://slip-service}")
                             String slipServiceBaseUrl) {
        RestClient.Builder resolvedBuilder = slipServiceBaseUrl.startsWith("http://localhost:")
                || slipServiceBaseUrl.startsWith("http://127.0.0.1:")
                || slipServiceBaseUrl.startsWith("http://d02-slip-service:")
                ? RestClient.builder()
                : builder;
        this.restClient = resolvedBuilder.baseUrl(slipServiceBaseUrl).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 기간 잠금 — slip-service 가 [from, to] (inclusive) 범위의 CONFIRMED 슬립을 LOCKED 로 전이.
     *
     * @param from 시작 일자 (inclusive)
     * @param to 종료 일자 (inclusive)
     * @return 잠근 슬립 건수 ({@code lockedCount} 응답 필드)
     * @throws BusinessException(CONFLICT) slip-service 4xx (endpoint 부재 / 잠금 충돌)
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx / 네트워크 실패
     */
    public int lockByPeriod(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }
        Map<String, Object> body = new HashMap<>();
        body.put("startDate", from.toString());
        body.put("endDate", to.toString());

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = restClient.post()
                    .uri(LOCK_BY_PERIOD_PATH)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.CONFLICT,
                                "slip-service lock-by-period 호출 실패: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service lock-by-period 호출 실패: " + res.getStatusCode());
                    })
                    .body(Map.class);
            return extractLockedCount(resp);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient {} failed: {}", LOCK_BY_PERIOD_PATH, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 호출 실패", ex);
        }
    }

    /**
     * 출고/입고전표 slipId 의 모든 라인 조회 — accounting-service 매출/입고전표 생성 시 검증용.
     *
     * <p>slip-service {@code GET /internal/slips/{slipId}/lines} 호출.
     * CONFIRMED 상태 + 매출=OUTBOUND/매입=INBOUND source 검증은 호출자 책임.
     *
     * @param slipId 전표 UUID (필수)
     * @return 전표 라인 snapshot 리스트 (빈 리스트 가능)
     * @throws BusinessException(FORBIDDEN) slip-service 인증/권한 실패 (401/403)
     * @throws BusinessException(SAS_SOURCE_SLIP_NOT_FOUND) 전표 미존재 (404)
     * @throws BusinessException(INVALID_INPUT) 기타 4xx
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public List<SlipLineSnapshot> getSlipLines(UUID slipId) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
        }
        try {
            return restClient.get()
                    .uri("/internal/slips/{slipId}/lines", slipId)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw mappedSourceRead4xx("getSlipLines", "slip lines", res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service getSlipLines 5xx: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<List<SlipLineSnapshot>>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient getSlipLines slipId={} 실패: {}", slipId, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service getSlipLines 호출 실패", ex);
        }
    }

    /**
     * 출고/입고전표 line 단건 조회 — accounting-service 매출/입고전표 라인 단건 검증용.
     *
     * <p>slip-service {@code GET /internal/slips/lines/{lineId}} 호출.
     *
     * @param lineId 라인 UUID (필수)
     * @return 라인 snapshot
     * @throws BusinessException(FORBIDDEN) slip-service 인증/권한 실패 (401/403)
     * @throws BusinessException(SAS_SOURCE_SLIP_NOT_FOUND) 라인 미존재 (404)
     * @throws BusinessException(INVALID_INPUT) 기타 4xx
     * @throws BusinessException(INTERNAL_ERROR) 5xx / 네트워크 실패
     */
    public SlipLineSnapshot getSlipLine(UUID lineId) {
        if (lineId == null) {
            throw new IllegalArgumentException("lineId 는 필수입니다");
        }
        try {
            return restClient.get()
                    .uri("/internal/slips/lines/{lineId}", lineId)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw mappedSourceRead4xx("getSlipLine", "slip line", res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service getSlipLine 5xx: " + res.getStatusCode());
                    })
                    .body(SlipLineSnapshot.class);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient getSlipLine lineId={} 실패: {}", lineId, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service getSlipLine 호출 실패", ex);
        }
    }

    @SuppressWarnings("unchecked")
    private static int extractLockedCount(Map<String, Object> resp) {
        if (resp == null) {
            return 0;
        }
        // ApiResponse 래핑 — { success, code, data: { lockedCount: N } }
        Object data = resp.get("data");
        Map<String, Object> payload;
        if (data instanceof Map<?, ?> dataMap) {
            payload = (Map<String, Object>) dataMap;
        } else {
            payload = resp;
        }
        Object count = payload.get("lockedCount");
        if (count instanceof Number n) {
            return n.intValue();
        }
        if (count instanceof String s) {
            try {
                return Integer.parseInt(s);
            } catch (NumberFormatException ignore) {
                return 0;
            }
        }
        return 0;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }

    private static BusinessException mappedSourceRead4xx(String operation, String target, HttpStatusCode status) {
        int code = status.value();
        if (code == 401 || code == 403) {
            return new BusinessException(ErrorCode.FORBIDDEN,
                    "slip-service 인증 실패: " + operation + " " + target + ", status=" + status);
        }
        if (code == 404) {
            return new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_FOUND,
                    "slip-service source 조회 실패: " + operation + " " + target + ", status=" + status);
        }
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "slip-service 4xx: " + operation + " " + target + ", status=" + status);
    }
}
