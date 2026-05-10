package com.samhanair.logis.inventory;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Inventory Service entry point — Warehouse + Stock 도메인 (plan §3 first slice).
 *
 * <p>{@link EnableScheduling} — P1-3 안전재고 polling (5분 주기 {@link com.samhanair.logis.inventory.service.SafetyStockService#scheduledCheck}).
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling
@Import(JpaAuditingConfig.class)
public class InventoryServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(InventoryServiceApplication.class, args);
    }
}
