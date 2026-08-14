package com.samhanair.logis.dashboard;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.shared.audit.publisher.AuditPublisherAutoConfiguration;
import com.samhanair.logis.dashboard.config.DashboardCacheProperties;
import com.samhanair.logis.dashboard.config.DashboardRefreshProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.Import;

/**
 * Dashboard Service entry point — Phase 9 W4.
 *
 * <p>KPI 일/주/월 스냅샷 + 실시간 재고 캐시 + 매출 집계 + 2 Postgres materialized view 통합.
 * 4 외부 client (Inventory / Accounting / PartnerOrder / Partner) + ServiceDiscoveryClient
 * 네 번째 소비자.
 *
 * <p>3 entity (KpiSnapshot / RealTimeStock / SalesAggregate) + 2 enum (KpiCategory /
 * AggregateInterval) + 4 client + 2 controller (Internal / Admin) + 4 service (KPI / RealTimeStock /
 * SalesAggregate / MaterializedViewRefresh) + Caffeine cache (KPI 60s TTL — D-P9-12).
 *
 * <p>외부 의존성 = inventory-service (8085) / accounting-service (8087) / partner-order-service (8088)
 * / partner-service (8095, W1).
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableCaching
@Import({JpaAuditingConfig.class, AuditPublisherAutoConfiguration.class})
@EnableConfigurationProperties({
        DashboardCacheProperties.class,
        DashboardRefreshProperties.class
})
public class DashboardServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DashboardServiceApplication.class, args);
    }
}
