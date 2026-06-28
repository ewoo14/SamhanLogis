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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;

/**
 * ApplicationContext load 만 검증하는 경량 IT — bean 등록 충돌 / dependency injection 누락 즉시 탐지.
 *
 * <p><b>장기 가드 (PR #119 회귀 fix 후속, memory feedback_pm_integration_build_check).</b>
 * partner-order-service 의 Configuration class 들에서 {@code @Bean} 메서드 이름이 클래스 빈 이름과
 * 충돌하는 패턴을 사전에 차단.
 *
 * <p>외부 client {@code @MockBean} 격리 — Eureka 비활성 환경 5xx 회피.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class ApplicationContextLoadIT extends AbstractPostgresIT {

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
    void contextLoads() {
        assertThat(applicationContext).isNotNull();
    }
}
