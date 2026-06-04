package com.samhanair.logis.security.department;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.aspectj.lang.annotation.Aspect;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** {@link DepartmentAspect} 단위 테스트 — 기존 {@code @hr.isExecutiveOffice()} 판정 미러. */
@ExtendWith(MockitoExtension.class)
@DisplayName("DepartmentAspect 부서 게이트 테스트")
class DepartmentAspectTest {

    private static final String SERVICE_NAME = "groupware-service";

    @Mock
    private HrAuthorizationHelper hr;

    private MeterRegistry meterRegistry;
    private TestProtectedTarget proxy;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        proxy = createProxy(new DepartmentAspect(
                hr,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME));
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void executiveOfficeAllows() {
        attachRole("MANAGER");
        given(hr.isExecutiveOffice()).willReturn(true);

        String result = proxy.createApproval();

        assertThat(result).isEqualTo("ok");
        verify(hr).isExecutiveOffice();
        assertThat(deniedCount("MANAGER")).isZero();
    }

    @Test
    void nonExecutiveOfficeDeniesWithPermissionAspectExceptionRule() {
        attachRole("MANAGER");
        given(hr.isExecutiveOffice()).willReturn(false);

        assertThatThrownBy(() -> proxy.createApproval())
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("department=EXECUTIVE_OFFICE")
                .hasMessageContaining("role=MANAGER");

        verify(hr).isExecutiveOffice();
        assertThat(deniedCount("MANAGER")).isEqualTo(1.0);
    }

    @Test
    void classLevelRequireDepartmentUsesWithinPointcutAndTargetClassFallback() {
        ClassLevelProtectedTarget classLevelProxy = createProxy(new ClassLevelProtectedTarget(), new DepartmentAspect(
                hr,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME));
        attachRole("MANAGER");
        given(hr.isExecutiveOffice()).willReturn(false);

        assertThatThrownBy(classLevelProxy::createApproval)
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("department=EXECUTIVE_OFFICE");

        given(hr.isExecutiveOffice()).willReturn(true);

        assertThat(classLevelProxy.createApproval()).isEqualTo("class-ok");
        assertThat(deniedCount("MANAGER")).isEqualTo(1.0);
    }

    private void attachRole(String role) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-User-Role", role);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    private double deniedCount(String role) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", "department",
                "role", role,
                "action", Department.EXECUTIVE_OFFICE.name()
        ).count();
    }

    private TestProtectedTarget createProxy(DepartmentAspect aspect) {
        return createProxy(new TestProtectedTarget(), aspect);
    }

    private <T> T createProxy(T target, DepartmentAspect aspect) {
        AspectJProxyFactory factory = new AspectJProxyFactory(target);
        factory.addAspect(aspect);
        return factory.getProxy();
    }

    /** {@link Aspect} 테스트용 타겟. */
    static class TestProtectedTarget {

        @RequireDepartment(Department.EXECUTIVE_OFFICE)
        public String createApproval() {
            return "ok";
        }
    }

    /** class-level {@link RequireDepartment} 테스트용 타겟. */
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    static class ClassLevelProtectedTarget {

        public String createApproval() {
            return "class-ok";
        }
    }
}
