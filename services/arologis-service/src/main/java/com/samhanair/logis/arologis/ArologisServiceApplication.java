package com.samhanair.logis.arologis;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.config.ArologisLocationCleanupProperties;
import com.samhanair.logis.common.audit.JpaAuditingConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.Import;

/**
 * Arologis Service entry point — Phase 10 W10-1.
 *
 * <p>배차 마이크로서비스 (카톡 메시지 파싱 → 차량/정차 추출 → 기사 매칭 → 전자서명 → GPS 추적).
 * Phase 10/11 renumber 결정 (사용자 결정 2026-05-07) — 본 서비스가 Phase 10, 기존 AWS migration 은
 * Phase 11 으로 이동.
 *
 * <p>5 entity (Dispatch / Vehicle / VehicleStop / Driver / Signature) + 1 GPS 추적 테이블
 * (DriverLocation) + 7 enum (DispatchType / VehicleTonnage / VehicleStatus / StopStatus /
 * DriverSource / MatchSource / SignatureSource) + KakaoDispatchParser + DriverMatcher 추상화
 * (Mock + Insung placeholder) + 4 외부 client (partner / user / slip / notification) + 3 controller
 * (Internal / Admin / Driver-app) + ShedLock daily cleanup.
 *
 * <p>port = 8097 (기존 14 service 8081~8095 + 8096 migration 예약 다음).
 * DB = arologis_db (service-per-DB).
 */
@SpringBootApplication
@EnableDiscoveryClient
@Import(JpaAuditingConfig.class)
@EnableConfigurationProperties({
        ArologisMatcherProperties.class,
        ArologisLocationCleanupProperties.class,
        ArologisJwtProperties.class
})
public class ArologisServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(ArologisServiceApplication.class, args);
    }
}
