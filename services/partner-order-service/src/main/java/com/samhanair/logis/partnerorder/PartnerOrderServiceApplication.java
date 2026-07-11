package com.samhanair.logis.partnerorder;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.config.PartnerOrderProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Partner Order Service entry point — Phase 6 M4.
 *
 * <p>거래처 주문 도메인의 단일 진입점. 8 entity (PartnerOrder/Line/Draft/History/FrontEventLog/
 * GateImage/TutorialState/SlipPublishOutbox) + 5 외부 client (DcConfig/Product/Inventory/Slip/
 * PartnerAuth) + outbox scheduler 활성화.
 *
 * <p>{@link EnableScheduling} 은 {@code SlipPublishOutboxScheduler} 의 cron 5분 retry 와
 * {@code BootstrapCacheRefreshScheduler} 의 bootstrap 내부 캐시 주기 갱신 트리거용.
 * {@link EnableCaching} 은 {@code BootstrapService} 의 18종 prefetch 캐시용.
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableCaching
@EnableScheduling
@Import(JpaAuditingConfig.class)
@EnableConfigurationProperties({
        PartnerOrderProperties.class,
        OutboxProperties.class
})
public class PartnerOrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PartnerOrderServiceApplication.class, args);
    }
}
