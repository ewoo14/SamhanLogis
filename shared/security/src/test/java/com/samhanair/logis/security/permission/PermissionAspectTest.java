package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.UUID;
import org.aspectj.lang.annotation.Aspect;
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
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * {@link PermissionAspect} 단위 테스트 — account×page×7-action 전환 검증.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PermissionAspect account 권한 테스트")
class PermissionAspectTest {

    private static final String SERVICE_NAME = "accounting-service";
    private static final UUID ACCOUNT_ID = UUID.fromString("a0000000-0000-0000-0000-000000000001");

    @Mock
    private DynamicPermissionClient client;

    @Mock
    private ObjectProvider<DynamicPermissionClient> clientProvider;

    private MeterRegistry meterRegistry;
    private TestProtectedTarget proxy;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        PermissionGuardMetrics metrics = new PermissionGuardMetrics(meterRegistry);
        PermissionAspect aspect = new PermissionAspect(clientProvider, metrics, SERVICE_NAME);

        AspectJProxyFactory factory = new AspectJProxyFactory(new TestProtectedTarget());
        factory.addAspect(aspect);
        proxy = factory.getProxy();

        given(clientProvider.getIfAvailable()).willReturn(client);
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void masterBypassesWithoutClientCall() {
        attachHeaders(null, "MASTER");

        String result = proxy.createJournal(null, "MASTER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    void partnerAlwaysDenied() {
        attachHeaders(ACCOUNT_ID.toString(), "PARTNER");

        assertThatThrownBy(() -> proxy.createJournal(ACCOUNT_ID.toString(), "PARTNER"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("role=PARTNER");

        verifyNoInteractions(client);
        assertThat(deniedCount("accounting.journals", "PARTNER", "CREATE")).isEqualTo(1.0);
    }

    @Test
    void partnerSelfServiceProceedsWithoutClientCheck() {
        attachHeaders(ACCOUNT_ID.toString(), "PARTNER");

        String result = proxy.printOwnOrder(ACCOUNT_ID.toString(), "PARTNER");

        assertThat(result).isEqualTo("print-ok");
        verifyNoInteractions(client);
        assertThat(deniedCount("sales.partner-order.print", "PARTNER", "PRINT")).isZero();
    }

    @Test
    void accountGrantAllows() {
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT");
        given(client.check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE)).willReturn(true);

        String result = proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT");

        assertThat(result).isEqualTo("ok");
        verify(client).check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE);
    }

    @Test
    void missingAccountIdDenies() {
        attachHeaders(null, "ACCOUNTANT");

        assertThatThrownBy(() -> proxy.createJournal(null, "ACCOUNTANT"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("accountId");

        verify(client, never()).check(null, "accounting.journals", PermissionAction.CREATE);
        assertThat(deniedCount("accounting.journals", "ACCOUNTANT", "CREATE")).isEqualTo(1.0);
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME, "page", page, "role", role, "action", action
        ).count();
    }

    private void attachHeaders(String accountId, String role) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (accountId != null) {
            req.addHeader("X-User-Id", accountId);
        }
        if (role != null) {
            req.addHeader("X-User-Role", role);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    /**
     * {@link Aspect} 테스트용 타겟.
     */
    static class TestProtectedTarget {

        @RequirePermission(page = "accounting.journals", action = PermissionAction.CREATE)
        public String createJournal(
                @RequestHeader(value = "X-User-Id", required = false) String accountId,
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "ok";
        }

        @RequirePermission(
                page = "sales.partner-order.print",
                action = PermissionAction.PRINT,
                partnerSelfService = true
        )
        public String printOwnOrder(
                @RequestHeader(value = "X-User-Id", required = false) String accountId,
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "print-ok";
        }
    }
}
