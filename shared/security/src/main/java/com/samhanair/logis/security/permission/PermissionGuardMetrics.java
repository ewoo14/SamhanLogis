package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * PermissionGuard deny 횟수 Micrometer 카운터 — SP-D5 신규.
 *
 * <p>metric 이름: {@code permission_guard_denied_total}.
 * tag: {@code service} / {@code page} / {@code role} / {@code action}.
 *
 * <p>NotificationGatewayMetrics 패턴 일관 (PR #D2):
 * Counter.builder 를 매 increment 호출마다 lazy-register 하는 방식을 사용한다.
 * MeterRegistry 는 동일 tag 조합의 Counter 를 내부 캐시로 관리하므로
 * 중복 register 는 기존 Counter 를 반환한다 (race-free).
 *
 * <p>기존 8개 PermissionGuard 의 {@code log.debug("[SP-D*] ... deny")} 구문 이후에
 * {@link #incrementDenied(String, String, String, String)} 를 추가 호출하여 deny 를 계측한다.
 *
 * <p>Prometheus 노출: {@code /actuator/prometheus} 에 자동 포함.
 * CloudWatch / Grafana 대시보드에서 role × page × action 매트릭스 시각화 가능.
 *
 * @see PermissionAspect
 * @since SP-D5
 */
@Component
public class PermissionGuardMetrics {

    /** Prometheus metric 이름 — Prometheus naming convention (lowercase + underscore + _total suffix). */
    public static final String COUNTER_NAME = "permission_guard_denied_total";

    private final MeterRegistry meterRegistry;

    /**
     * 생성자 주입.
     *
     * @param meterRegistry Micrometer MeterRegistry (각 service 의 Spring 컨텍스트에서 자동 주입)
     */
    public PermissionGuardMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    /**
     * PermissionGuard deny 횟수 increment.
     *
     * <p>동일 tag 조합은 MeterRegistry 내부 캐시로 deduplication 되므로 호출마다 builder 생성해도 안전.
     *
     * <p>호출 시점: PermissionGuard 의 {@code checkView} / {@code checkEdit} 가 403 를 던지기 직전,
     * 또는 {@link PermissionAspect} 가 {@link org.springframework.security.access.AccessDeniedException} 을
     * 던지기 직전.
     *
     * @param service service 식별자 (예: {@code "accounting"}, {@code "inventory"})
     * @param page    페이지 코드 (예: {@code "accounting.reports"}, {@code "inventory.warehouse"})
     * @param role    역할 코드 (예: {@code "SALES"}, {@code "MANAGER"})
     * @param action  액션 코드 (예: {@code "VIEW"}, {@code "EDIT"})
     */
    public void incrementDenied(String service, String page, String role, String action) {
        Counter.builder(COUNTER_NAME)
                .description("PermissionGuard deny 횟수 — service/page/role/action 별 집계")
                .tag("service", service == null ? "unknown" : service)
                .tag("page",    page    == null ? "unknown" : page)
                .tag("role",    role    == null ? "unknown" : role)
                .tag("action",  action  == null ? "unknown" : action)
                .register(meterRegistry)
                .increment();
    }
}
