package com.samhanair.logis.dashboard.client;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * accounting-service (8087) 호출 client — 매출 데이터 집계용.
 *
 * <p>Phase 9 W4 — skeleton fail-soft 정책. accounting-service 가 dashboard 전용 매출 집계
 * endpoint 를 노출하기 전까지는 BigDecimal.ZERO 반환.
 *
 * <p>Phase 10 cutover 시점에 accounting-service 의 trial-balance + journal 합계 API 와 통합.
 *
 * <p>IT 에서는 {@code @MockBean AccountingClient} 격리 의무.
 *
 * <p>PR #94 W4 후속 fix (BE 의견 2 채택) — skeleton-mode 토글.
 * skeleton-mode true (W4 default) 시 외부 호출 회피 + ZERO 반환.
 * false 시 Phase 10 cutover — 실 호출 + 응답 파싱은 cutover 시점 BE 슬라이스에서 구현.
 */
@Slf4j
@Component
public class AccountingClient {

    private final RestClient.Builder builder;
    private final ServiceDiscoveryClient discoveryClient;
    private final String baseUrl;
    private final String internalToken;
    private final boolean skeletonMode;
    private final Counter scrapeFailures;

    public AccountingClient(RestClient.Builder builder,
                             ServiceDiscoveryClient discoveryClient,
                             @Value("${samhan.accounting-service.url:http://localhost:8087}") String baseUrl,
                             @Value("${app.security.internal.token:}") String internalToken,
                             @Value("${samhan.dashboard.client.skeleton-mode:true}") boolean skeletonMode,
                             MeterRegistry meterRegistry) {
        this.builder = builder;
        this.discoveryClient = discoveryClient;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
        this.skeletonMode = skeletonMode;
        this.scrapeFailures = Counter.builder("dashboard_accounting_scrape_failures")
                .description("dashboard-service accounting-service prometheus scrape failures")
                .register(meterRegistry);
    }

    /**
     * 거래처 + 일자 범위에 해당하는 매출 합계 lookup.
     *
     * @param partnerId 거래처 UUID
     * @param from 시작 일자 (inclusive)
     * @param to 종료 일자 (inclusive)
     * @return 합계 금액 (skeleton 단계 — 외부 호출 후 실패 시 ZERO)
     */
    public BigDecimal sumSalesByPartner(UUID partnerId, LocalDate from, LocalDate to) {
        if (partnerId == null || from == null || to == null) {
            return BigDecimal.ZERO;
        }
        if (skeletonMode) {
            log.debug("AccountingClient skeleton-mode — partnerId={}, from={}, to={} (외부 호출 회피, ZERO 반환)",
                    partnerId, from, to);
            return BigDecimal.ZERO;
        }
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            String body = client.get()
                    .uri("/internal/sales?partnerId={pid}&from={from}&to={to}",
                            partnerId, from.toString(), to.toString())
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            // Phase 10 cutover 시점 응답 파싱 활성 (현재는 미구현).
            log.debug("AccountingClient sales lookup body length={}", body == null ? 0 : body.length());
            throw new UnsupportedOperationException(
                    "AccountingClient body 파싱은 Phase 10 cutover 시점에 활성됩니다 (skeleton-mode=false 진입 전 BE 슬라이스 구현 의무).");
        } catch (UnsupportedOperationException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AccountingClient sales lookup 실패 — partnerId={}, msg={}", partnerId, ex.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * accounting-service actuator Prometheus text 조회.
     *
     * <p>actuator 는 형제 service 내부 통신 전용이며 accounting-service 가 {@code X-Internal-Token}
     * 으로 보호한다. 조회 실패 시 대시보드가 빈 지표로 fail-soft 된다.
     */
    public String fetchPrometheusMetrics() {
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            String body = client.get()
                    .uri("/actuator/prometheus")
                    .header("X-Internal-Token", internalToken == null ? "" : internalToken)
                    .retrieve()
                    .body(String.class);
            return body == null ? "" : body;
        } catch (Exception ex) {
            scrapeFailures.increment();
            log.error("AccountingClient prometheus metric 조회 실패 — baseUrl={}, msg={}",
                    baseUrl, ex.getMessage(), ex);
            return "";
        }
    }

    /** Phase 10 활성 대비 — discovery client 보유 검증 (현재 미사용). */
    public ServiceDiscoveryClient getDiscoveryClient() {
        return discoveryClient;
    }
}
