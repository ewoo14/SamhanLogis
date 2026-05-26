package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * {@link PermissionAspect} 단위 테스트 — SP-D5.
 *
 * <p>SP-D5 cycle 2 fix (P1-3): 기존 헬퍼 우회 방식 폐기.
 * Spring AOP {@link AspectJProxyFactory} + {@code @RequirePermission} 부착 메서드를 가진
 * 테스트 타겟 클래스를 사용하여 실제 {@code @Around} advice 가 동작하는지 단위 검증한다.
 *
 * <p>X-User-Role 헤더는 {@code RequestContextHolder} 에 주입한 {@link MockHttpServletRequest}
 * 를 통해 전달하여 운영 환경의 {@code HeaderAuthenticationFilter} 호환성을 함께 검증한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PermissionAspect 단위 테스트 — 실제 @Around advice 검증")
class PermissionAspectTest {

    /** 본 단위 테스트의 service tag 식별자 (Counter 라벨 검증에 사용). */
    private static final String SERVICE_NAME = "accounting-service";

    @Mock
    private DynamicPermissionClient client;

    @Mock
    private ObjectProvider<DynamicPermissionClient> clientProvider;

    private MeterRegistry meterRegistry;
    private PermissionGuardMetrics metrics;
    private TestProtectedTarget proxy;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        metrics = new PermissionGuardMetrics(meterRegistry);
        PermissionAspect aspect = new PermissionAspect(clientProvider, metrics, SERVICE_NAME);

        TestProtectedTarget target = new TestProtectedTarget();
        AspectJProxyFactory factory = new AspectJProxyFactory(target);
        factory.addAspect(aspect);
        proxy = factory.getProxy();

        // 기본: client bean 존재 + 헤더 미주입 (테스트별로 override)
        given(clientProvider.getIfAvailable()).willReturn(client);
        RequestContextHolder.resetRequestAttributes();
    }

    // -----------------------------------------------------------------------
    // VIEW 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("VIEW 허용 시 통과 (canView=true), Counter 증가 없음")
    void view_허용_통과() {
        attachRoleHeader("MANAGER");
        given(client.canView("MANAGER", "accounting.reports")).willReturn(true);

        String result = proxy.viewReport("MANAGER");

        assertThat(result).isEqualTo("ok");
        assertThat(deniedCount("accounting.reports", "MANAGER", "VIEW")).isEqualTo(0.0);
    }

    @Test
    @DisplayName("VIEW 거부 시 AccessDeniedException + Counter 1 증가")
    void view_거부_AccessDeniedException() {
        attachRoleHeader("SALES");
        given(client.canView("SALES", "accounting.reports")).willReturn(false);

        assertThatThrownBy(() -> proxy.viewReport("SALES"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("deny")
                .hasMessageContaining("page=accounting.reports")
                .hasMessageContaining("action=VIEW")
                .hasMessageContaining("role=SALES");

        assertThat(deniedCount("accounting.reports", "SALES", "VIEW")).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // EDIT 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("EDIT 허용 시 통과 (canEdit=true), canView 미호출")
    void edit_허용_통과() {
        attachRoleHeader("MANAGER");
        given(client.canEdit("MANAGER", "inventory.warehouse")).willReturn(true);

        String result = proxy.editWarehouse("MANAGER");

        assertThat(result).isEqualTo("ok");
        verify(client, never()).canView("MANAGER", "inventory.warehouse");
    }

    @Test
    @DisplayName("EDIT 거부 시 AccessDenied + Counter 1")
    void edit_거부_AccessDeniedException() {
        attachRoleHeader("SALES");
        given(client.canEdit("SALES", "inventory.warehouse")).willReturn(false);

        assertThatThrownBy(() -> proxy.editWarehouse("SALES"))
                .isInstanceOf(AccessDeniedException.class);

        assertThat(deniedCount("inventory.warehouse", "SALES", "EDIT")).isEqualTo(1.0);
        verify(client, never()).canView("SALES", "inventory.warehouse");
    }

    // -----------------------------------------------------------------------
    // 건너뜀 / 회피 시나리오
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("DynamicPermissionClient bean 없으면 권한 검증 건너뜀 + client 미호출")
    void client_bean_없음_건너뜀() {
        given(clientProvider.getIfAvailable()).willReturn(null);
        attachRoleHeader("ANY");

        String result = proxy.viewReport("ANY");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("X-User-Role 헤더 없으면 (헤더/파라미터 모두) 권한 검증 건너뜀")
    void roleCode_헤더없음_건너뜀() {
        // attachRoleHeader 호출 안 함 (헤더 부재)
        String result = proxy.viewReport(null);

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("X-User-Role 헤더 빈 문자열이면 권한 검증 건너뜀")
    void roleCode_blank_건너뜀() {
        attachRoleHeader("   ");
        String result = proxy.viewReport("   ");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("미지원 action 값 → 권한 검증 건너뜀 (WARN 로그)")
    void unsupported_action_건너뜀() {
        attachRoleHeader("MANAGER");

        String result = proxy.unsupportedAction("MANAGER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("@RequestHeader 파라미터로 role 전달 시 정상 추출 (HttpRequest 헤더 없어도)")
    void roleCode_파라미터_경로() {
        // RequestContextHolder 비움 — 파라미터 경로로만 추출
        given(client.canView("MANAGER", "accounting.reports")).willReturn(true);

        String result = proxy.viewReport("MANAGER");

        assertThat(result).isEqualTo("ok");
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME, "page", page, "role", role, "action", action
        ).count();
    }

    private void attachRoleHeader(String roleValue) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (roleValue != null) {
            req.addHeader("X-User-Role", roleValue);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    // -----------------------------------------------------------------------
    // 테스트 타겟 — @RequirePermission 부착 메서드 모음
    // -----------------------------------------------------------------------

    /**
     * AspectJProxyFactory 가 프록시로 감쌀 테스트용 컴포넌트.
     * Controller 와 동일한 형태로 {@link RequirePermission} 어노테이션을 부착한다.
     */
    static class TestProtectedTarget {

        @RequirePermission(page = "accounting.reports", action = "VIEW")
        public String viewReport(@RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "ok";
        }

        @RequirePermission(page = "inventory.warehouse", action = "EDIT")
        public String editWarehouse(@RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "ok";
        }

        @RequirePermission(page = "partners.list", action = "DELETE")  // 미지원 action
        public String unsupportedAction(@RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "ok";
        }
    }
}
