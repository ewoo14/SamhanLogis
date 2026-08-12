package com.samhanair.logis.dcconfig;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.shared.audit.publisher.AuditPublisherAutoConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.Import;

/**
 * DC Config Service entry point — Phase 6 M3.
 *
 * <p>Owner of Partner master (옵션 A — M2 가 internal RPC 호출), DcConfig, DcRule,
 * PriceCalculationLog. 포트 8089. DB: dc_config_db.
 */
@SpringBootApplication
@EnableDiscoveryClient
@Import({JpaAuditingConfig.class, AuditPublisherAutoConfiguration.class})
public class DcConfigServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DcConfigServiceApplication.class, args);
    }
}
