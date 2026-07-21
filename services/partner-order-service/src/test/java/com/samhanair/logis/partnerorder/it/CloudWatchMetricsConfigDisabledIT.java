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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient;

/**
 * #863 R1 BLOCKING-1 — {@link CloudWatchMetricsConfigEnabledIT} 의 반대편. 기본값
 * (property 미설정 → {@code management.metrics.export.cloudwatch.enabled=false})에서는
 * {@code @ConditionalOnProperty} 가드로 {@code CloudWatchMetricsConfig} 자체가 로드되지 않아
 * {@link CloudWatchMeterRegistry}·{@link CloudWatchAsyncClient} 빈이 하나도 생성되지 않아야 한다
 * — local/dev/test/CI 에서 AWS SDK 호출이 전혀 없음을 빈 부재로 직접 증명한다(문서 서술만으로
 * 믿지 않는다).
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class CloudWatchMetricsConfigDisabledIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

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
    @DisplayName("기본값(enabled=false)에서는 CloudWatchMeterRegistry·CloudWatchAsyncClient 빈이 전혀 생성되지 않는다")
    void cloudWatchBeans_areAbsentByDefault() {
        assertThat(applicationContext.getBeansOfType(CloudWatchMeterRegistry.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(CloudWatchAsyncClient.class)).isEmpty();
    }
}
