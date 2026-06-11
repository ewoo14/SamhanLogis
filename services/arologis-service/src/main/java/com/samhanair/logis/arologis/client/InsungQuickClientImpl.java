package com.samhanair.logis.arologis.client;

import com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse;
import com.samhanair.logis.arologis.client.dto.InsungOrderStatus;
import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 인성데이타 퀵프로그램 REST 어댑터 구현체 — Phase 10 W10-2.
 *
 * <p>SP-09 vendor 시리즈 (NTS/Aligo/Clova/KFTC) 와 동일한 패턴 적용:
 * <ul>
 *   <li>placeholder 가드 — 6 키워드 차단 + blank 차단 → {@code INSUNG_QUICK_NOT_CONFIGURED} (502)</li>
 *   <li>timeout 5s + retry 1회 (Spring Retry)</li>
 *   <li>sandbox-mode=true 시 실 API 미호출, mock 응답 반환</li>
 *   <li>4xx → fail-soft (null 또는 빈 결과), 5xx/network → BusinessException</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 내부 UUID 는 응답에 포함되지 않음.
 * {@link InsungDriverMatchResponse#vendorDriverId()} 는 인성 vendor 측 식별자.
 */
@Slf4j
@Component
public class InsungQuickClientImpl implements InsungQuickClient {

    /**
     * placeholder 차단 키워드 목록 (대소문자 무시) — SP-09 vendor 일관 적용.
     * blank/null 도 별도 차단.
     */
    private static final String[] PLACEHOLDER_KEYWORDS = {
            "PLACEHOLDER_DEV_ONLY",
            "CHANGE_ME_LOCAL_ONLY",
            "changeme",
            "dummy",
            "placeholder"
    };

    private final ArologisMatcherProperties properties;
    private final RestClient.Builder restClientBuilder;

    /**
     * InsungQuickClientImpl 생성자.
     *
     * @param properties       arologis matcher 설정 (insungQuick.* 포함)
     * @param restClientBuilder WebClient config 기본 builder
     */
    public InsungQuickClientImpl(ArologisMatcherProperties properties,
                                  RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClientBuilder = restClientBuilder;
    }

    /**
     * API 키가 placeholder 또는 blank 인지 검증.
     *
     * <p>6 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
     * {@code changeme} / {@code dummy} / {@code placeholder}) + blank 를 차단.
     *
     * @param apiKey 검증할 API 키
     * @return placeholder 또는 blank 이면 {@code true}
     */
    public boolean isPlaceholderApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return true;
        }
        String upper = apiKey.toUpperCase();
        for (String keyword : PLACEHOLDER_KEYWORDS) {
            if (upper.contains(keyword.toUpperCase())) {
                return true;
            }
        }
        return false;
    }

    /**
     * placeholder 가드 검증. placeholder 또는 blank 시 {@link BusinessException} throw.
     *
     * @throws BusinessException {@code INSUNG_QUICK_NOT_CONFIGURED} (502) — placeholder/blank 시
     */
    private void guardApiKey() {
        ArologisMatcherProperties.InsungQuick cfg = properties.getInsungQuick();
        if (isPlaceholderApiKey(cfg.getApiKey())) {
            throw new BusinessException(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED,
                    "SAMHAN_INSUNG_QUICK_API_KEY 가 placeholder 입니다. 환경변수를 올바른 값으로 설정해주세요.");
        }
    }

    /**
     * sandbox-mode 여부 반환.
     */
    private boolean isSandboxMode() {
        return properties.getInsungQuick().isSandboxMode();
    }

    /**
     * timeout 적용 RestClient 생성.
     */
    private RestClient buildClient() {
        int timeoutMs = properties.getInsungQuick().getRequestTimeoutMs();
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(timeoutMs);
        rf.setReadTimeout(timeoutMs);
        return restClientBuilder.clone()
                .baseUrl(properties.getInsungQuick().getApiUrl())
                .requestFactory(rf)
                .build();
    }

    /**
     * {@inheritDoc}
     *
     * <p>sandbox-mode=true 시 mock vendorOrderId {@code SANDBOX-<UUID>} 반환.
     * 실 API: {@code POST /api/orders} — 차량 + 정차 정보 전송 → vendorOrderId 반환.
     */
    @Override
    @Retryable(
            retryFor = RestClientException.class,
            maxAttempts = 2,
            backoff = @Backoff(delay = 500)
    )
    public String requestOrder(Vehicle vehicle, List<VehicleStop> stops) {
        if (isSandboxMode()) {
            String sandboxId = "SANDBOX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
            log.info("[InsungQuick] sandbox-mode requestOrder — vehicleSeq={} sandboxOrderId={}",
                    vehicle.getSequence(), sandboxId);
            return sandboxId;
        }
        guardApiKey();
        try {
            RestClient client = buildClient();
            Map<?, ?> response = client.post()
                    .uri("/api/orders")
                    .header("X-Api-Key", properties.getInsungQuick().getApiKey())
                    .header("X-Partner-Id", properties.getInsungQuick().getPartnerId())
                    .body(Map.of(
                            "vehicleSeq", vehicle.getSequence(),
                            "tonnage", vehicle.getTonnage().name(),
                            "stopCount", stops.size()
                    ))
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                log.warn("[InsungQuick] requestOrder 응답 null — vehicleSeq={}", vehicle.getSequence());
                return null;
            }
            return String.valueOf(response.get("orderId"));
        } catch (HttpClientErrorException ex) {
            log.warn("[InsungQuick] requestOrder 4xx — vehicleSeq={} status={} msg={}",
                    vehicle.getSequence(), ex.getStatusCode(), ex.getMessage());
            return null;
        } catch (RestClientException ex) {
            log.error("[InsungQuick] requestOrder 5xx/network — vehicleSeq={} error={}",
                    vehicle.getSequence(), ex.getMessage());
            throw new BusinessException(ErrorCode.INSUNG_QUICK_SUBMIT_FAILED,
                    "인성데이타 API 호출 실패: " + ex.getMessage());
        }
    }

    /**
     * {@inheritDoc}
     *
     * <p>sandbox-mode=true 시 mock 매칭 성공 응답 반환 (vendorDriverId = {@code SANDBOX-DRV-001}).
     * 실 API: {@code POST /api/orders/{orderId}/match} — 매칭 trigger.
     */
    @Override
    @Retryable(
            retryFor = RestClientException.class,
            maxAttempts = 2,
            backoff = @Backoff(delay = 500)
    )
    public InsungDriverMatchResponse requestMatch(String vendorOrderId) {
        if (isSandboxMode()) {
            log.info("[InsungQuick] sandbox-mode requestMatch — vendorOrderId={}", vendorOrderId);
            return InsungDriverMatchResponse.matched(
                    "SANDBOX-DRV-001",
                    "인성기사(sandbox)",
                    "010-9999-9999",
                    "1톤",
                    null
            );
        }
        guardApiKey();
        try {
            RestClient client = buildClient();
            Map<?, ?> response = client.post()
                    .uri("/api/orders/{orderId}/match", vendorOrderId)
                    .header("X-Api-Key", properties.getInsungQuick().getApiKey())
                    .header("X-Partner-Id", properties.getInsungQuick().getPartnerId())
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                log.warn("[InsungQuick] requestMatch 응답 null — vendorOrderId={}", vendorOrderId);
                return InsungDriverMatchResponse.pending();
            }
            boolean matched = Boolean.TRUE.equals(response.get("matched"));
            if (!matched) {
                return InsungDriverMatchResponse.pending();
            }
            return InsungDriverMatchResponse.matched(
                    String.valueOf(response.get("driverId")),
                    (String) response.get("driverName"),
                    (String) response.get("driverPhone"),
                    (String) response.get("vehicleType"),
                    // 인성데이타 응답 키 확정 후 매핑: 현재 협의 후보 키 vehiclePlateNumber.
                    (String) response.get("vehiclePlateNumber")
            );
        } catch (HttpClientErrorException ex) {
            log.warn("[InsungQuick] requestMatch 4xx — vendorOrderId={} status={} msg={}",
                    vendorOrderId, ex.getStatusCode(), ex.getMessage());
            return InsungDriverMatchResponse.failed("4xx: " + ex.getMessage());
        } catch (RestClientException ex) {
            log.error("[InsungQuick] requestMatch 5xx/network — vendorOrderId={} error={}",
                    vendorOrderId, ex.getMessage());
            throw new BusinessException(ErrorCode.INSUNG_QUICK_SUBMIT_FAILED,
                    "인성데이타 매칭 API 호출 실패: " + ex.getMessage());
        }
    }

    /**
     * {@inheritDoc}
     *
     * <p>sandbox-mode=true 시 취소 요청 no-op (로그만 출력).
     * 실 API: {@code DELETE /api/orders/{orderId}}.
     */
    @Override
    @Retryable(
            retryFor = RestClientException.class,
            maxAttempts = 2,
            backoff = @Backoff(delay = 500)
    )
    public void cancelOrder(String vendorOrderId) {
        if (isSandboxMode()) {
            log.info("[InsungQuick] sandbox-mode cancelOrder — vendorOrderId={}", vendorOrderId);
            return;
        }
        guardApiKey();
        try {
            RestClient client = buildClient();
            client.delete()
                    .uri("/api/orders/{orderId}", vendorOrderId)
                    .header("X-Api-Key", properties.getInsungQuick().getApiKey())
                    .header("X-Partner-Id", properties.getInsungQuick().getPartnerId())
                    .retrieve()
                    .toBodilessEntity();
            log.info("[InsungQuick] cancelOrder 성공 — vendorOrderId={}", vendorOrderId);
        } catch (HttpClientErrorException ex) {
            log.warn("[InsungQuick] cancelOrder 4xx — vendorOrderId={} status={} msg={}",
                    vendorOrderId, ex.getStatusCode(), ex.getMessage());
        } catch (RestClientException ex) {
            log.error("[InsungQuick] cancelOrder 5xx/network — vendorOrderId={} error={}",
                    vendorOrderId, ex.getMessage());
            throw new BusinessException(ErrorCode.INSUNG_QUICK_SUBMIT_FAILED,
                    "인성데이타 취소 API 호출 실패: " + ex.getMessage());
        }
    }

    /**
     * {@inheritDoc}
     *
     * <p>sandbox-mode=true 시 mock 상태 (ASSIGNED) 반환.
     * 실 API: {@code GET /api/orders/{orderId}/status}.
     */
    @Override
    @Retryable(
            retryFor = RestClientException.class,
            maxAttempts = 2,
            backoff = @Backoff(delay = 500)
    )
    public InsungOrderStatus queryStatus(String vendorOrderId) {
        if (isSandboxMode()) {
            log.info("[InsungQuick] sandbox-mode queryStatus — vendorOrderId={}", vendorOrderId);
            return new InsungOrderStatus(vendorOrderId, "ASSIGNED", "SANDBOX-DRV-001", "sandbox 상태 조회");
        }
        guardApiKey();
        try {
            RestClient client = buildClient();
            Map<?, ?> response = client.get()
                    .uri("/api/orders/{orderId}/status", vendorOrderId)
                    .header("X-Api-Key", properties.getInsungQuick().getApiKey())
                    .header("X-Partner-Id", properties.getInsungQuick().getPartnerId())
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                log.warn("[InsungQuick] queryStatus 응답 null — vendorOrderId={}", vendorOrderId);
                return null;
            }
            return new InsungOrderStatus(
                    vendorOrderId,
                    (String) response.get("status"),
                    (String) response.get("driverId"),
                    (String) response.get("message")
            );
        } catch (HttpClientErrorException ex) {
            log.warn("[InsungQuick] queryStatus 4xx — vendorOrderId={} status={} msg={}",
                    vendorOrderId, ex.getStatusCode(), ex.getMessage());
            return null;
        } catch (RestClientException ex) {
            log.error("[InsungQuick] queryStatus 5xx/network — vendorOrderId={} error={}",
                    vendorOrderId, ex.getMessage());
            throw new BusinessException(ErrorCode.INSUNG_QUICK_SUBMIT_FAILED,
                    "인성데이타 상태 조회 API 호출 실패: " + ex.getMessage());
        }
    }
}
