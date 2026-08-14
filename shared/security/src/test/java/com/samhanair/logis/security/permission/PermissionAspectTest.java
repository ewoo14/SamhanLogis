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
import java.util.List;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * {@link PermissionAspect} 단위 테스트 — account×page×7-action 전환 검증.
 *
 * <p>Phase C5-4 갱신:
 * <ul>
 *   <li>MASTER bypass 경로: X-Is-System-Master=true 헤더 단독 판정. role="MASTER" 폴백 제거.</li>
 *   <li>PARTNER 거절 경로: X-Is-Partner=true 헤더 기반으로 전환. role="PARTNER" 폴백 제거.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PermissionAspect account 권한 테스트")
class PermissionAspectTest {

    private static final String SERVICE_NAME = "accounting-service";
    private static final UUID ACCOUNT_ID = UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID DISPATCH_MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000101");
    private static final UUID DISPATCH_ACCOUNTANT_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000102");
    private static final UUID DISPATCH_DRIVER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000103");

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
        SecurityContextHolder.clearContext();
    }

    /**
     * C5-4: X-Is-System-Master=true → role 무관하게 bypass.
     *
     * <p>기존 테스트 masterBypassesWithoutClientCall 은 role=MASTER 단독 폴백을
     * 검증했으나 C5-4 에서 폴백 제거. 본 테스트는 X-Is-System-Master=true bypass 를 검증한다.
     */
    @Test
    @DisplayName("C5-4: X-Is-System-Master=true → bypass (role 무관)")
    void systemMasterHeader_bypasses_regardlessOfRole() {
        // X-Is-System-Master=true 가 있으면 role 이 무엇이든 bypass
        attachHeaders(null, "MASTER", "true", null);

        String result = proxy.createJournal(null, "MASTER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    /**
     * C5-4: role=MASTER 단독(X-Is-System-Master 없음) → bypass 하지 않음 (폴백 제거).
     *
     * <p>Phase C4 이전 동작: role=MASTER 이면 X-Is-System-Master 없어도 bypass.
     * Phase C5-4 이후: role 클레임이 JWT 에서 소멸 → 헤더 미전달 → null 수신.
     * 기존 폴백 보안 위험(임의 role 주입 bypass) 제거.
     * role=MASTER 가 있어도 X-Is-System-Master=true 없으면 bypass 하지 않음.
     */
    @Test
    @DisplayName("C5-4: role=MASTER + X-Is-System-Master 없음 → bypass 하지 않음 (폴백 제거)")
    void roleMaster_withoutSystemMasterHeader_doesNotBypass() {
        // role=MASTER 이지만 X-Is-System-Master 없음 → bypass 하지 않음
        // accountId 없으므로 accountId deny 경로로 떨어짐
        attachHeaders(null, "MASTER", null, null);

        assertThatThrownBy(() -> proxy.createJournal(null, "MASTER"))
                .isInstanceOf(AccessDeniedException.class);
    }

    /**
     * C5-4 + P1-b: X-Is-Partner=true → deny, 메트릭 roleCode = "PARTNER" 고정.
     *
     * <p>api-gateway 가 JWT partnerCode claim 존재 시 X-Is-Partner: true 를 주입한다.
     * role="PARTNER" 폴백은 C5-4 에서 제거되었으므로 본 테스트는 헤더 기반 경로를 검증한다.
     *
     * <p>P1-b: X-Is-Partner=true 분기에서 거절 메트릭 roleCode 를 "PARTNER" 고정.
     * C5-4 이전에는 X-User-Role 이 없어 roleCode=UNKNOWN 으로 기록되었으나
     * P1-b 수정 후 "PARTNER" 레이블로 정확히 기록된다.
     */
    @Test
    @DisplayName("C5-4 + P1-b: X-Is-Partner=true → deny, 메트릭 roleCode=PARTNER 고정")
    void isPartnerHeader_true_alwaysDenied_withPartnerRoleCodeInMetrics() {
        attachHeaders(ACCOUNT_ID.toString(), null, null, "true");

        assertThatThrownBy(() -> proxy.createJournal(ACCOUNT_ID.toString(), null))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("PARTNER identity");

        verifyNoInteractions(client);
        // P1-b: roleCode = "PARTNER" 고정 (기존 "UNKNOWN" 아님)
        assertThat(deniedCount("accounting.journals", "PARTNER", "CREATE")).isEqualTo(1.0);
        // "UNKNOWN" 카운터는 0 이어야 함
        assertThat(deniedCount("accounting.journals", "UNKNOWN", "CREATE")).isZero();
    }

    /**
     * C5-4: X-Is-Partner=true + partnerSelfService=true → 통과 (자기범위 endpoint).
     */
    @Test
    @DisplayName("C5-4: X-Is-Partner=true + partnerSelfService → 통과")
    void isPartnerHeader_partnerSelfService_proceeds() {
        attachHeaders(ACCOUNT_ID.toString(), null, null, "true");

        String result = proxy.printOwnOrder(ACCOUNT_ID.toString(), null);

        assertThat(result).isEqualTo("print-ok");
        verifyNoInteractions(client);
        assertThat(deniedCount("sales.partner-order.print", "UNKNOWN", "PRINT")).isZero();
    }

    @Test
    void accountGrantAllows() {
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", null, null);
        given(client.check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE)).willReturn(true);

        String result = proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT");

        assertThat(result).isEqualTo("ok");
        verify(client).check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE);
    }

    @Test
    @DisplayName("그룹 기반 계정 권한 거부는 role=UNKNOWN을 노출하지 않는다")
    void accountPermissionDenyUsesGroupBasedSubjectWhenRoleHeaderIsAbsent() {
        attachHeaders(ACCOUNT_ID.toString(), null, null, null);
        given(client.check(ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE)).willReturn(false);

        assertThatThrownBy(() -> proxy.createJournal(ACCOUNT_ID.toString(), null))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("subject=GROUP_BASED")
                .hasMessageNotContaining("role=UNKNOWN");

        assertThat(deniedCount("accounting.journals", "GROUP_BASED", "CREATE")).isEqualTo(1.0);
    }

    @Test
    void missingAccountIdDenies() {
        attachHeaders(null, "ACCOUNTANT", null, null);

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
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", null, null);

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
        attachIndependentArologisHeaders("AROLOGIS_MANAGER");
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
        attachIndependentArologisHeaders("AROLOGIS_DRIVER");
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
        attachIndependentArologisHeaders("AROLOGIS_MASTER");

        String result = roleProxy.createJournal(null, "AROLOGIS_MASTER");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    // -----------------------------------------------------------------------
    // Phase C4: X-Is-System-Master 헤더 bypass 검증 (C5-4 갱신)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C4-(a) X-Is-System-Master=true → role 무관하게 bypass")
    void isSystemMasterHeaderTrue_bypasses() {
        // role 이 ACCOUNTANT 여도 X-Is-System-Master=true 이면 bypass
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", "true", null);

        String result = proxy.createJournal(ACCOUNT_ID.toString(), "ACCOUNTANT");

        assertThat(result).isEqualTo("ok");
        verifyNoInteractions(client);
    }

    /**
     * C5-4: role=MASTER + X-Is-System-Master 없음 → bypass 하지 않음 (C4 폴백 제거).
     *
     * <p>Phase C4 이전: role=MASTER 이면 X-Is-System-Master 없어도 bypass(락아웃 방지 폴백).
     * Phase C5-4: role 클레임 JWT 에서 소멸 → 헤더 미전달 → null 수신. 폴백 보안 위험 제거.
     * role=MASTER 헤더가 존재하더라도 X-Is-System-Master=true 없으면 bypass 하지 않음.
     * accountId 없어 accountId deny 경로로 떨어짐.
     */
    @Test
    @DisplayName("C5-4 (구 C4-b): role=MASTER + X-Is-System-Master 없음 → deny (폴백 제거)")
    void roleMasterWithoutHeader_doesNotBypassAfterC54() {
        attachHeaders(null, "MASTER", null, null);

        assertThatThrownBy(() -> proxy.createJournal(null, "MASTER"))
                .isInstanceOf(AccessDeniedException.class);

        verifyNoInteractions(client);
    }

    @Test
    @DisplayName("C4-(c) X-Is-System-Master=false + role=ACCOUNTANT → grant 없으면 403")
    void isSystemMasterFalse_nonMasterRole_deniedWithoutGrant() {
        attachHeaders(ACCOUNT_ID.toString(), "ACCOUNTANT", "false", null);
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
        attachHeaders(ACCOUNT_ID.toString(), "MANAGER", "true", null);

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
        attachIndependentArologisHeaders("AROLOGIS_MANAGER");
        given(client.canEdit("AROLOGIS_MANAGER", "accounting.journals")).willReturn(false);

        assertThatThrownBy(() -> roleProxy.createJournal(null, "AROLOGIS_MANAGER"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("role permission missing");

        verify(client).canEdit("AROLOGIS_MANAGER", "accounting.journals");
        verify(client, never()).check(null, "accounting.journals", PermissionAction.CREATE);
        assertThat(deniedCount("accounting.journals", "AROLOGIS_MANAGER", "CREATE")).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // R16 RED: gateway employee account/group path vs independent Arologis JWT
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("RED-A: 게이트웨이 MANAGER는 role 없이 account 권한으로 가배차 VIEW 허용")
    void redA_gatewayManager_withoutRole_usesAccountPermission() {
        TestProtectedTarget hybridProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                "arologis-service",
                true));
        attachGatewayHeaders(DISPATCH_MANAGER_ACCOUNT_ID);
        given(client.check(
                DISPATCH_MANAGER_ACCOUNT_ID,
                "arologis.dispatch.ops",
                PermissionAction.VIEW)).willReturn(true);

        String result = hybridProxy.viewDispatchOps(DISPATCH_MANAGER_ACCOUNT_ID.toString(), null);

        assertThat(result).isEqualTo("dispatch-view-ok");
        verify(client).check(DISPATCH_MANAGER_ACCOUNT_ID, "arologis.dispatch.ops", PermissionAction.VIEW);
        verify(client, never()).canView(anyString(), anyString());
    }

    @Test
    @DisplayName("RED-B: 게이트웨이 ACCOUNTANT는 account 권한 false로 가배차 VIEW 거부")
    void redB_gatewayAccountant_withoutRole_usesAccountPermissionAndDenies() {
        TestProtectedTarget hybridProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                "arologis-service",
                true));
        attachGatewayHeaders(DISPATCH_ACCOUNTANT_ACCOUNT_ID);
        given(client.check(
                DISPATCH_ACCOUNTANT_ACCOUNT_ID,
                "arologis.dispatch.ops",
                PermissionAction.VIEW)).willReturn(false);

        assertThatThrownBy(() -> hybridProxy.viewDispatchOps(DISPATCH_ACCOUNTANT_ACCOUNT_ID.toString(), null))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("account permission missing");
        verify(client).check(DISPATCH_ACCOUNTANT_ACCOUNT_ID, "arologis.dispatch.ops", PermissionAction.VIEW);
        verify(client, never()).canView(anyString(), anyString());
    }

    @Test
    @DisplayName("GREEN-B: 게이트웨이 DRIVER는 account 권한 false로 가배차 VIEW 거부")
    void gatewayDriver_withoutRole_usesAccountPermissionAndDenies() {
        TestProtectedTarget hybridProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                "arologis-service",
                true));
        attachGatewayHeaders(DISPATCH_DRIVER_ACCOUNT_ID);
        given(client.check(
                DISPATCH_DRIVER_ACCOUNT_ID,
                "arologis.dispatch.ops",
                PermissionAction.VIEW)).willReturn(false);

        assertThatThrownBy(() -> hybridProxy.viewDispatchOps(DISPATCH_DRIVER_ACCOUNT_ID.toString(), null))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("account permission missing");
        verify(client).check(DISPATCH_DRIVER_ACCOUNT_ID, "arologis.dispatch.ops", PermissionAction.VIEW);
        verify(client, never()).canView(anyString(), anyString());
    }

    @Test
    @DisplayName("RED-C: 아로로지스 독립 JWT role 경로는 기존 role 권한을 유지")
    void redC_independentArologisJwt_keepsRolePermissionPath() {
        TestProtectedTarget hybridProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                "arologis-service",
                true));
        attachIndependentArologisHeaders("AROLOGIS_MANAGER");
        given(client.canView("AROLOGIS_MANAGER", "arologis.dispatch.ops")).willReturn(true);

        String result = hybridProxy.viewDispatchOps(ACCOUNT_ID.toString(), "AROLOGIS_MANAGER");

        assertThat(result).isEqualTo("dispatch-view-ok");
        verify(client).canView("AROLOGIS_MANAGER", "arologis.dispatch.ops");
        verify(client, never()).check(any(), anyString(), any());
    }

    @Test
    @DisplayName("GREEN-A: 게이트웨이 MANAGER는 role 없이 가배차 실행 UPDATE도 account 권한으로 허용")
    void gatewayManager_withoutRole_usesAccountPermissionForExecution() {
        TestProtectedTarget hybridProxy = createProxy(new PermissionAspect(
                clientProvider,
                new PermissionGuardMetrics(meterRegistry),
                "arologis-service",
                true));
        attachGatewayHeaders(DISPATCH_MANAGER_ACCOUNT_ID);
        given(client.check(
                DISPATCH_MANAGER_ACCOUNT_ID,
                "arologis.dispatch.ops",
                PermissionAction.UPDATE)).willReturn(true);

        String result = hybridProxy.executeDispatchOps(DISPATCH_MANAGER_ACCOUNT_ID.toString(), null);

        assertThat(result).isEqualTo("dispatch-execute-ok");
        verify(client).check(DISPATCH_MANAGER_ACCOUNT_ID, "arologis.dispatch.ops", PermissionAction.UPDATE);
        verify(client, never()).canEdit(anyString(), anyString());
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME, "page", page, "role", role, "action", action
        ).count();
    }

    // -----------------------------------------------------------------------
    // Phase C5-3: parseGroupsHeader 단위 검증
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C5-3-(a) parseGroupsHeader — null 이면 빈 Set")
    void parseGroupsHeader_null_returnsEmptySet() {
        assertThat(PermissionAspect.parseGroupsHeader(null)).isEmpty();
    }

    @Test
    @DisplayName("C5-3-(b) parseGroupsHeader — blank 이면 빈 Set")
    void parseGroupsHeader_blank_returnsEmptySet() {
        assertThat(PermissionAspect.parseGroupsHeader("   ")).isEmpty();
    }

    @Test
    @DisplayName("C5-3-(c) parseGroupsHeader — 단일 UUID 파싱")
    void parseGroupsHeader_singleUuid_returnsSingletonSet() {
        String uuid = "00000000-0000-0000-0000-000000000100";
        assertThat(PermissionAspect.parseGroupsHeader(uuid)).containsExactly(uuid);
    }

    @Test
    @DisplayName("C5-3-(d) parseGroupsHeader — comma-join UUID 3개 파싱")
    void parseGroupsHeader_multipleUuids_returnsAllInSet() {
        String raw = "00000000-0000-0000-0000-000000000100,00000000-0000-0000-0000-000000000101,"
                + "00000000-0000-0000-0000-000000000102";
        java.util.Set<String> result = PermissionAspect.parseGroupsHeader(raw);
        assertThat(result).hasSize(3)
                .contains(
                        "00000000-0000-0000-0000-000000000100",
                        "00000000-0000-0000-0000-000000000101",
                        "00000000-0000-0000-0000-000000000102");
    }

    @Test
    @DisplayName("C5-3-(e) parseGroupsHeader — 공백 trim 및 빈 항목 제거")
    void parseGroupsHeader_whitespaceAndEmpty_trimsAndFilters() {
        String raw = " uuid-1 , , uuid-2 ";
        java.util.Set<String> result = PermissionAspect.parseGroupsHeader(raw);
        assertThat(result).hasSize(2).contains("uuid-1", "uuid-2");
    }

    @Test
    @DisplayName("C5-3-(f) parseGroupsHeader — 말미 콤마 무시 (dual review P2 경계)")
    void parseGroupsHeader_trailingComma_ignored() {
        java.util.Set<String> result = PermissionAspect.parseGroupsHeader("uuid-1,uuid-2,");
        assertThat(result).hasSize(2).contains("uuid-1", "uuid-2");
    }

    @Test
    @DisplayName("C5-3-(g) parseGroupsHeader — 중복 UUID 자동 제거 (dual review P2 경계)")
    void parseGroupsHeader_duplicates_deduplicated() {
        java.util.Set<String> result = PermissionAspect.parseGroupsHeader("uuid-1,uuid-1,uuid-2");
        assertThat(result).hasSize(2).contains("uuid-1", "uuid-2");
    }

    private void attachHeaders(String accountId, String role) {
        attachHeaders(accountId, role, null, null);
    }

    private void attachHeaders(String accountId, String role, String isSystemMaster, String isPartner) {
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
        if (isPartner != null) {
            req.addHeader("X-Is-Partner", isPartner);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    private void attachGatewayHeaders(UUID accountId) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-User-Id", accountId.toString());
        req.addHeader("X-User-Groups", "00000000-0000-0000-0000-000000000201");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
        SecurityContextHolder.clearContext();
    }

    private void attachIndependentArologisHeaders(String role) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-User-Id", ACCOUNT_ID.toString());
        req.addHeader("X-User-Role", role);
        req.addHeader("Authorization", "Bearer validated-arologis-jwt");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                ACCOUNT_ID.toString(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
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

        @RequirePermission(page = "arologis.dispatch.ops", action = PermissionAction.VIEW)
        public String viewDispatchOps(
                @RequestHeader(value = "X-User-Id", required = false) String accountId,
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "dispatch-view-ok";
        }

        @RequirePermission(page = "arologis.dispatch.ops", action = PermissionAction.UPDATE)
        public String executeDispatchOps(
                @RequestHeader(value = "X-User-Id", required = false) String accountId,
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return "dispatch-execute-ok";
        }
    }
}
