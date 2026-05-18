package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link PermissionGuardMetrics} 단위 테스트 — SP-D5.
 *
 * <p>SimpleMeterRegistry 를 사용하여 외부 의존 없이 Counter 증가값을 검증한다.
 */
@DisplayName("PermissionGuardMetrics 단위 테스트")
class PermissionGuardMetricsTest {

    private SimpleMeterRegistry registry;
    private PermissionGuardMetrics metrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        metrics  = new PermissionGuardMetrics(registry);
    }

    @Test
    @DisplayName("incrementDenied 호출 시 permission_guard_denied_total Counter 가 1 증가한다")
    void incrementDenied_단순_1회_증가() {
        // when
        metrics.incrementDenied("inventory", "inventory.warehouse", "SALES", "VIEW");

        // then
        double count = registry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", "inventory",
                "page",    "inventory.warehouse",
                "role",    "SALES",
                "action",  "VIEW"
        ).count();
        assertThat(count).isEqualTo(1.0);
    }

    @Test
    @DisplayName("동일 tag 조합으로 2회 호출 시 Counter 값이 2가 된다")
    void incrementDenied_동일_태그_2회_누적() {
        // given
        metrics.incrementDenied("accounting", "accounting.reports", "MANAGER", "EDIT");
        metrics.incrementDenied("accounting", "accounting.reports", "MANAGER", "EDIT");

        // then
        double count = registry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", "accounting",
                "page",    "accounting.reports",
                "role",    "MANAGER",
                "action",  "EDIT"
        ).count();
        assertThat(count).isEqualTo(2.0);
    }

    @Test
    @DisplayName("다른 tag 조합은 별도 Counter 로 분리된다")
    void incrementDenied_다른_태그_조합_분리() {
        // given — 2개의 서로 다른 tag 조합
        metrics.incrementDenied("partner", "partners.list", "SALES", "VIEW");
        metrics.incrementDenied("partner", "partners.list", "MANAGER", "EDIT");

        // then
        double salesCount = registry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", "partner",
                "page",    "partners.list",
                "role",    "SALES",
                "action",  "VIEW"
        ).count();
        double managerCount = registry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", "partner",
                "page",    "partners.list",
                "role",    "MANAGER",
                "action",  "EDIT"
        ).count();

        assertThat(salesCount).isEqualTo(1.0);
        assertThat(managerCount).isEqualTo(1.0);
    }

    @Test
    @DisplayName("null 파라미터 전달 시 'unknown' 으로 대체되어 Counter 가 등록된다")
    void incrementDenied_null_파라미터_unknown_대체() {
        // when — service, page null
        metrics.incrementDenied(null, null, "MASTER", "VIEW");

        // then
        double count = registry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", "unknown",
                "page",    "unknown",
                "role",    "MASTER",
                "action",  "VIEW"
        ).count();
        assertThat(count).isEqualTo(1.0);
    }

    @Test
    @DisplayName("Counter 이름이 COUNTER_NAME 상수와 일치한다")
    void counterName_상수_확인() {
        assertThat(PermissionGuardMetrics.COUNTER_NAME).isEqualTo("permission_guard_denied_total");
    }
}
