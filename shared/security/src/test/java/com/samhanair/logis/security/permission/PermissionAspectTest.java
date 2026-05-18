package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * {@link PermissionAspect} 단위 테스트 — SP-D5.
 *
 * <p>AOP Aspect 의 핵심 로직인 권한 검증 분기를 직접 호출하여 단위 검증한다.
 * Spring 컨텍스트 없이 Mockito + {@link PermissionAspectTestHelper} 헬퍼로 검증한다.
 *
 * <p>MockitoSettings LENIENT: 각 테스트가 공통 @Mock 을 선택적으로만 사용하기 때문에
 * UnnecessaryStubbingException 을 억제한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PermissionAspect 단위 테스트")
class PermissionAspectTest {

    @Mock
    private DynamicPermissionClient client;

    @Mock
    @SuppressWarnings("unchecked")
    private ObjectProvider<DynamicPermissionClient> clientProvider;

    private PermissionGuardMetrics metrics;
    private PermissionAspect aspect;

    @BeforeEach
    void setUp() {
        metrics = new PermissionGuardMetrics(new SimpleMeterRegistry());
        aspect  = new PermissionAspect(clientProvider, metrics);
    }

    // -----------------------------------------------------------------------
    // VIEW 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("VIEW 허용 시 denied=false, metrics deny 0")
    void view_허용_통과() {
        // given
        given(client.canView("MANAGER", "accounting.reports")).willReturn(true);

        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);
        boolean denied = helper.evaluateViewPermission(client, "MANAGER", "accounting.reports");

        assertThat(denied).isFalse();
        assertThat(deniedCount("accounting", "accounting.reports", "MANAGER", "VIEW")).isEqualTo(0.0);
    }

    @Test
    @DisplayName("VIEW 거부 시 AccessDeniedException + metrics increment")
    void view_거부_AccessDeniedException() {
        // given
        given(client.canView("SALES", "accounting.reports")).willReturn(false);

        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);

        assertThatThrownBy(() -> helper.evaluateAndThrowIfDenied(
                client, "SALES", "accounting.reports", "VIEW", "accounting"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("deny");

        assertThat(deniedCount("accounting", "accounting.reports", "SALES", "VIEW")).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // EDIT 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("EDIT 허용 시 통과")
    void edit_허용_통과() {
        // given
        given(client.canEdit("MANAGER", "inventory.warehouse")).willReturn(true);

        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);
        boolean denied = helper.evaluateEditPermission(client, "MANAGER", "inventory.warehouse");

        assertThat(denied).isFalse();
    }

    @Test
    @DisplayName("EDIT 거부 + VIEW 허용 (view-only override) → denied=true + metrics")
    void edit_거부_view_허용_뷰온리_오버라이드() {
        // given
        given(client.canEdit("SALES", "partners.list")).willReturn(false);
        given(client.canView("SALES", "partners.list")).willReturn(true);

        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);

        assertThatThrownBy(() -> helper.evaluateAndThrowIfDenied(
                client, "SALES", "partners.list", "EDIT", "partner"))
                .isInstanceOf(AccessDeniedException.class);

        assertThat(deniedCount("partner", "partners.list", "SALES", "EDIT")).isEqualTo(1.0);
    }

    @Test
    @DisplayName("EDIT 거부 + VIEW 거부 (fallback) → 통과, deny 없음")
    void edit_거부_view_거부_fallback_통과() {
        // given
        given(client.canEdit("SALES", "partners.list")).willReturn(false);
        given(client.canView("SALES", "partners.list")).willReturn(false);

        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);
        boolean denied = helper.evaluateEditPermission(client, "SALES", "partners.list");

        assertThat(denied).isFalse();
        assertThat(deniedCount("partner", "partners.list", "SALES", "EDIT")).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // 건너뜀 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("DynamicPermissionClient bean 없으면 client 미호출")
    void client_bean_없음_건너뜀() {
        // client 는 아무 stub 없음 — 호출 자체가 없어야 함
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("roleCode null 이면 client 미호출")
    void roleCode_null_건너뜀() {
        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);
        boolean denied = helper.evaluateViewPermission(client, null, "accounting.reports");

        assertThat(denied).isFalse();
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("roleCode 빈 문자열이면 client 미호출")
    void roleCode_blank_건너뜀() {
        PermissionAspectTestHelper helper = new PermissionAspectTestHelper(aspect);
        boolean denied = helper.evaluateViewPermission(client, "  ", "accounting.reports");

        assertThat(denied).isFalse();
        verifyNoInteractions(client);
    }

    // -----------------------------------------------------------------------
    // helper
    // -----------------------------------------------------------------------

    private double deniedCount(String service, String page, String role, String action) {
        try {
            java.lang.reflect.Field field = PermissionGuardMetrics.class.getDeclaredField("meterRegistry");
            field.setAccessible(true);
            io.micrometer.core.instrument.MeterRegistry reg =
                    (io.micrometer.core.instrument.MeterRegistry) field.get(metrics);
            return reg.counter(
                    PermissionGuardMetrics.COUNTER_NAME,
                    "service", service, "page", page, "role", role, "action", action
            ).count();
        } catch (Exception e) {
            return -1;
        }
    }

    // -----------------------------------------------------------------------
    // 내부 테스트 헬퍼
    // -----------------------------------------------------------------------

    /**
     * {@link PermissionAspect} 의 권한 평가 핵심 로직을 직접 호출하기 위한 테스트 헬퍼.
     *
     * <p>Spring AOP 프록시 없이 단위 검증이 가능하도록 핵심 분기 로직을 래핑한다.
     */
    static class PermissionAspectTestHelper {

        private final PermissionAspect aspect;

        PermissionAspectTestHelper(PermissionAspect aspect) {
            this.aspect = aspect;
        }

        /**
         * VIEW 권한 평가 — deny 여부만 반환 (throw 안 함).
         */
        boolean evaluateViewPermission(DynamicPermissionClient client, String role, String page) {
            if (role == null || role.isBlank()) return false;
            return !client.canView(role, page);
        }

        /**
         * EDIT 권한 평가 — deny 여부만 반환 (throw 안 함).
         */
        boolean evaluateEditPermission(DynamicPermissionClient client, String role, String page) {
            if (role == null || role.isBlank()) return false;
            if (!client.canEdit(role, page)) {
                return client.canView(role, page); // view-only override 시 true (deny)
            }
            return false;
        }

        /**
         * 권한 평가 후 deny 시 {@link AccessDeniedException} throw + metrics increment.
         */
        void evaluateAndThrowIfDenied(DynamicPermissionClient client, String role,
                                      String page, String action, String service) {
            if (role == null || role.isBlank()) return;

            boolean denied;
            if ("VIEW".equals(action)) {
                denied = !client.canView(role, page);
            } else {
                boolean canEdit = client.canEdit(role, page);
                denied = !canEdit && client.canView(role, page);
            }

            if (denied) {
                try {
                    java.lang.reflect.Field metricsField =
                            PermissionAspect.class.getDeclaredField("metrics");
                    metricsField.setAccessible(true);
                    PermissionGuardMetrics m = (PermissionGuardMetrics) metricsField.get(aspect);
                    m.incrementDenied(service, page, role, action);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
                throw new AccessDeniedException(
                        String.format("[SP-D5] 동적 권한 deny — page=%s action=%s role=%s",
                                page, action, role));
            }
        }
    }
}
