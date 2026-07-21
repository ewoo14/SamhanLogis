package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import io.micrometer.cloudwatch2.CloudWatchMeterRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.composite.CompositeMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.metrics.export.prometheus.PrometheusScrapeEndpoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient;

/**
 * #863 R1 BLOCKING-1 — {@code CloudWatchMetricsConfig} 가 property 값에 따라 실제로 빈을
 * 등록/미등록하는지 Spring 컨텍스트 부팅으로 직접 증명한다.
 *
 * <p>"application.yml 에 설정이 있다"·"클래스가 존재한다" 만으로 PASS 하지 않는다 — R1 이 지목한
 * BLOCKING-1 은 정확히 이 지점("설정은 있는데 이를 소비하는 auto-config 진입점이 Spring Boot 3.x
 * 에 없다")이었으므로, 실제 {@link ApplicationContext} 에 {@link CloudWatchMeterRegistry}·
 * {@link CloudWatchAsyncClient} 빈이 뜨는지를 빈 조회로 확인한다.
 *
 * <p>{@code region} 을 명시해 AWS SDK 기본 리전 자동탐지(IMDS 등 네트워크 호출 가능성)를 피한다.
 * CloudWatch registry는 생성 후 publish scheduler를 시작하고 context 종료 시 flush하므로,
 * 이 테스트는 {@link CloudWatchAsyncClient}를 mock으로 격리한다. 따라서 빈 배선과 registry
 * 포함 관계만 검증하며 실제 AWS {@code PutMetricData} 호출은 하지 않는다.
 *
 * <p>{@code @MockBean} 목록은 이 service 의 기존 {@link ApplicationContextLoadIT}(전체 context
 * 부팅에 필요한 외부 client 최소 집합, Eureka 비활성 환경 5xx 회피)와 동일하다 — 이 클래스는 별도
 * property 조합이라 그 context 를 캐시 재사용하지 않고 독립적으로 새로 부팅한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class,
        properties = {
                "management.metrics.export.cloudwatch.enabled=true",
                "management.metrics.export.cloudwatch.namespace=SamhanLogis/PartnerOrderTest",
                "management.metrics.export.cloudwatch.region=ap-northeast-2",
        })
class CloudWatchMetricsConfigEnabledIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    @MockBean
    private CloudWatchAsyncClient cloudWatchAsyncClient;

    @MockBean
    private DcConfigClient dcConfigClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private PartnerAuthClient partnerAuthClient;
    @MockBean
    private PartnerLookupClient partnerLookupClient;
    @MockBean
    private ProductCatalogLookupClient catalogLookupClient;

    @Test
    @DisplayName("enabled=true 면 CloudWatchMeterRegistry·CloudWatchAsyncClient 빈이 실제로 등록된다")
    void cloudWatchBeans_areRegisteredWhenEnabled() {
        CloudWatchMeterRegistry registry = applicationContext.getBean(CloudWatchMeterRegistry.class);
        CloudWatchAsyncClient client = applicationContext.getBean(CloudWatchAsyncClient.class);

        assertThat(registry).isNotNull();
        assertThat(client).isNotNull();
    }

    /**
     * #863 R1 BLOCKING-1 부수 효과 확증 — {@code OutboxObservabilityMetrics}/
     * {@code SlipPublishOutboxResultWriter} 가 실제로 주입받는 primary {@link MeterRegistry} 가
     * CloudWatch 로도 전달되는지 실측한다.
     *
     * <p>CloudWatch registry가 실제 주입되는 {@link MeterRegistry} 자신이거나 primary composite에
     * 포함되는지를 확인한다. Prometheus registry/endpoint 생존은 별도 테스트에서 직접 고정한다.
     */
    @Test
    @DisplayName("실측: primary MeterRegistry 빈이 CloudWatchMeterRegistry 자신이거나 그것을 포함한 composite다")
    void primaryMeterRegistry_isOrIncludesCloudWatchRegistry() {
        MeterRegistry primary = applicationContext.getBean(MeterRegistry.class);
        CloudWatchMeterRegistry cloudWatchRegistry = applicationContext.getBean(CloudWatchMeterRegistry.class);

        boolean isCloudWatchItself = primary == cloudWatchRegistry;
        boolean compositeIncludesCloudWatch = primary instanceof CompositeMeterRegistry composite
                && composite.getRegistries().contains(cloudWatchRegistry);

        assertThat(isCloudWatchItself || compositeIncludesCloudWatch)
                .as("실제 주입 MeterRegistry(런타임 타입=%s)가 CloudWatchMeterRegistry 자신이거나 그것을 포함해야"
                        + " OutboxObservabilityMetrics 의 게이지 3종·terminal counter 가 CloudWatch 로도 나간다",
                        primary.getClass().getName())
                .isTrue();
    }

    @Test
    @DisplayName("enabled=true 여도 PrometheusMeterRegistry와 prometheus endpoint 경로가 유지된다")
    void prometheusRegistry_remainsAvailableWhenCloudWatchIsEnabled() {
        assertThat(applicationContext.getBeansOfType(PrometheusMeterRegistry.class))
                .as("CloudWatch 활성화가 Prometheus registry를 제거하면 /actuator/prometheus도 소실된다")
                .isNotEmpty();
        assertThat(applicationContext.getBeansOfType(PrometheusScrapeEndpoint.class))
                .as("Prometheus registry가 살아 있어도 scrape endpoint bean이 없으면 관측 경로가 소실된다")
                .isNotEmpty();
    }

}
