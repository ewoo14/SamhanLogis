package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
        proxy = createProxy(new PermissionAspect(clientProvider, metrics, SERVICE_NAME));

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

    /** [실QA fail-secure] DynamicPermissionClient bean 미구성(null) 시 검증 skip(fail-open) 금지 — deny. */
    @Test
    void missingClientDeniesFailSecure() {
        given(clientProvider.getIfAvailable()).willReturn(null);
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT");

        assertThatThrownBy(() -> proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("permission client missing");

        assertThat(deniedCount("accounting.journals", "ACCOUNTANT", "CREATE")).isEqualTo(1.0);
    }

    @Test
    void roleModeUsesCanEditWithoutAccountId() {
        TestProtectedTarget roleProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME,
                true));
        attachHeaders(null, "AROLOGIS_MANAGER");
        given(client.canEdit("AROLOGIS_MANAGER", "accounting.journals")).willReturn(true);

        String result = roleProxy.createJournal(null, "AROLOGIS_MANAGER");

        assertThat(result).isEqualTo("ok");
        verify(client).canEdit("AROLOGIS_MANAGER", "accounting.journals");
        verify(client, never()).check(null, "accounting.journals", PermissionAction.CREATE);
    }

    @Test
    void roleModeUsesCanViewForViewAction() {
        TestProtectedTarget roleProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME,
                true));
        attachHeaders(null, "AROLOGIS_DRIVER");
        given(client.canView("AROLOGIS_DRIVER", "arologis.driver")).willReturn(true);

        String result = roleProxy.viewDriverPage(null, "AROLOGIS_DRIVER");

        assertThat(result).isEqualTo("view-ok");
        verify(client).canView("AROLOGIS_DRIVER", "arologis.driver");
        verify(client, never()).check(null, "arologis.driver", PermissionAction.VIEW);
    }

    @Test
    void roleModeArologisMasterBypassesWithoutClientCall() {
        TestProtectedTarget roleProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME,
                true));
        attachHeaders(null, "AROLOGIS_MASTER");

        String result = roleProxy.createJournal(null, "AROLOGIS_MASTER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    // -----------------------------------------------------------------------
    // Phase C4: X-Is-System-Master 헤더 bypass + role 폴백 OR 검증
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C4-(a) X-Is-System-Master=true → role 무관하게 bypass")
    void isSystemMasterHeaderTrue_bypasses() {
        // role 이 ACCOUNTANT 여도 X-Is-System-Master=true 이면 bypass
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", "true");

        String result = proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("C4-(b) role=MASTER + 헤더 없음 → 기존 폴백으로 bypass (락아웃 0)")
    void roleMasterWithoutHeader_bypassViaFallback() {
        // X-Is-System-Master 헤더가 없어도 role=MASTER 이면 bypass 보장
        attachHeaders(null, "MASTER", null);

        String result = proxy.createJournal(null, "MASTER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("C4-(c) X-Is-System-Master=false + role=ACCOUNTANT → grant 없으면 403")
    void isSystemMasterFalse_nonMasterRole_deniedWithoutGrant() {
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", "false");
        given(client.check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE)).willReturn(false);

        assertThatThrownBy(() -> proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT"))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
                .hasMessageContaining("account permission missing");

        verify(client).check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE);
        assertThat(deniedCount("accounting.journals", "ACCOUNTANT", "CREATE")).isEqualTo(1.0);
    }

    @Test
    @DisplayName("C4-(d) X-Is-System-Master=true 이면 DynamicPermissionClient 호출 0건")
    void isSystemMasterTrue_noClientCall() {
        attachHeaders(ACCOUNT_ID.toString(), "MANAGER", "true");

        proxy.createJournal(ACCOUNT_ID.toString(), "MANAGER");

        verify(client, never()).check(any(), anyString(), any());
        verify(client, never()).canView(anyString(), anyString());
        verify(client, never()).canEdit(anyString(), anyString());
    }

    @Test
    void roleModeDeniesWhenCanEditFalse() {
        TestProtectedTarget roleProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                SERVICE_NAME,
                true));
        attachHeaders(null, "AROLOGIS_MANAGER");
        given(client.canEdit("AROLOGIS_MANAGER", "accounting.journals")).willReturn(false);

        assertThatThrownBy(() -> roleProxy.createJournal(null, "AROLOGIS_MANAGER"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("role permission missing");

        verify(client).canEdit("AROLOGIS_MANAGER", "accounting.journals");
        verify(client, never()).check(null, "accounting.journals", PermissionAction.CREATE);
        assertThat(deniedCount("accounting.journals", "AROLOGIS_MANAGER", "CREATE")).isEqualTo(1.0);
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME, "page", page, "role", role, "action", action
        ).count();
    }

    private void attachHeaders(String accountId, String role) {
        attachHeaders(accountId, role, null);
    }

    private void attachHeaders(String accountId, String role, String isSystemMaster) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (accountId != null) {
            req.addHeader("X-User-Id", accountId);
        }
        if (role != null) {
            req.addHeader("X-User-Role", role);
        }
        if (isSystemMaster != null) {
            req.addHeader("X-Is-System-Master", isSystemMaster);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    private TestProtectedTarget createProxy(PermissionAspect aspect) {
        AspectJProxyFactory factory = new AspectJProxyFactory(new TestProtectedTarget());
        factory.addAspect(aspect);
        return factory.getProxy();
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

        @RequirePermission(page = "arologis.driver", action = PermissionAction.VIEW)
        public String viewDriverPage(
                @RequestHeader(value = "X-User-Id", required = false) String accountId,
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "view-ok";
        }
    }
}
