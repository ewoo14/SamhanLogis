package com.samhanair.logis.partnerauth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerauth.config.HeaderAuthenticationFilter;
import com.samhanair.logis.partnerauth.controller.PartnerApprovalsController;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.service.PartnerApprovalService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * PR #462 Round C #4 (P1 보안) — {@code PartnerApprovalsController} @RequirePermission enforcement IT.
 *
 * <p><b>회귀 차단 대상</b>: 가드 추가 전, 주문서 승인 3 endpoint(목록/상태변경/비번초기화)에
 * {@link com.samhanair.logis.security.permission.RequirePermission} 가 전무하여
 * {@code sales.partner-order.list} 권한이 없는 인증 직원(WAREHOUSE/DISPATCH/INVENTORY 등)이
 * URL 직접 진입으로 승인변경·비번초기화가 가능했다(fail-open). 본 IT 는 동적 권한 deny 시 403 +
 * deny counter 증가, grant 시 통과(!403)를 실 HTTP(MockMvc) 로 검증한다
 * ([[feedback_enforcement_real_http_test]] — 계약 변경 차원 실 HTTP 회귀).
 *
 * <p>{@code @WebMvcTest} slice 로 Testcontainers Postgres 불필요 → Windows 로컬 + CI Linux 양쪽 실행.
 * 실 {@link com.samhanair.logis.security.permission.PermissionAspect}(AOP) + service 의
 * {@link HeaderAuthenticationFilter}(X-User-Id → principal) + SecurityFilterChain 매칭을 통과한다.
 *
 * <p>{@link DynamicPermissionClient} 는 {@code @MockBean} 으로 격리(auth-service 호출 차단,
 * SP-D2 P04 트랩 회귀 방지 패턴). account 모드: aspect 가 {@code check(accountId, page, action)} 로 판정.
 */
@WebMvcTest(
        controllers = PartnerApprovalsController.class,
        properties = {
                "spring.application.name=partner-auth-service"
        })
@Import({
        PermissionSecurityAutoConfiguration.class,
        PartnerApprovalsPermissionControllerIT.TestSecurityConfig.class,
        PartnerApprovalsPermissionControllerIT.TestMeterConfig.class
})
class PartnerApprovalsPermissionControllerIT {

    private static final String SERVICE_NAME = "partner-auth-service";
    private static final String PAGE = "sales.partner-order.list";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000901");
    private static final String PARTNER_CODE = "1234567890";

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private PartnerApprovalService partnerApprovalService;
    // shared:common 의 @EnableJpaAuditing 가 @WebMvcTest slice 에서도 jpaMappingContext 를 요구한다
    // (JPA repository 미로드 → metamodel 비어 BeanCreation 실패). inventory IT 와 동일 격리.
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        // 기본 grant — deny 케이스는 개별 stub override.
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        PartnerApprovalResponse row = new PartnerApprovalResponse(
                PARTNER_CODE, "테스트거래처", PartnerApprovalStatus.UNAPPROVED,
                null, false, false, null);
        Page<PartnerApprovalResponse> page = new PageImpl<>(java.util.List.of(row));
        lenient().when(partnerApprovalService.list(any(), any())).thenReturn(page);
        lenient().when(partnerApprovalService.updateStatus(anyString(), any())).thenReturn(row);
        lenient().when(partnerApprovalService.resetPassword(anyString())).thenReturn(row);
    }

    @ParameterizedTest(name = "{0} grant → !403")
    @MethodSource("endpoints")
    @DisplayName("sales.partner-order.list 권한 grant 시 통과")
    void approvalEndpoint_withGrant_isNotForbidden(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(PAGE), eq(endpoint.action()))).thenReturn(true);

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} deny → 403 + counter")
    @MethodSource("endpoints")
    @DisplayName("sales.partner-order.list 권한 미부여 인증 직원은 403 + deny counter 증가 (fail-open 차단)")
    void approvalEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(PAGE), eq(endpoint.action()))).thenReturn(false);
        double before = deniedCount(endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "{0} MASTER bypass → !403")
    @MethodSource("endpoints")
    @DisplayName("X-Is-System-Master=true 는 동적 권한 미부여여도 bypass 통과")
    void approvalEndpoint_systemMaster_bypassesDynamicCheck(EndpointCase endpoint) throws Exception {
        // override row 미존재(check=false) 여도 MASTER 헤더로 bypass.
        when(dynamicPermissionClient.check(eq(ID), eq(PAGE), eq(endpoint.action()))).thenReturn(false);

        mockMvc.perform(withActor(endpoint.request().get(), "MASTER")
                        .header("X-Is-System-Master", "true"))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} PARTNER deny → 403")
    @MethodSource("endpoints")
    @DisplayName("거래처 본인(X-Is-Partner=true)은 승인 화면 접근 불가 (partnerSelfService 미지정)")
    void approvalEndpoint_partnerIdentity_returns403(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(PAGE), eq(endpoint.action()))).thenReturn(true);

        mockMvc.perform(withActor(endpoint.request().get(), "PARTNER")
                        .header("X-Is-Partner", "true"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("3 endpoint 의 @RequirePermission page/action 계약 박제")
    void requirePermissionContract_isStable() throws Exception {
        assertRequirePermission("list", PermissionAction.VIEW,
                int.class, int.class, PartnerApprovalStatus.class);
        assertRequirePermission(
                "updateStatus",
                PermissionAction.UPDATE,
                String.class,
                com.samhanair.logis.partnerauth.dto.UpdatePartnerApprovalStatusRequest.class);
        assertRequirePermission("resetPassword", PermissionAction.UPDATE, String.class);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("approval list", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/api/v1/partner-approvals").param("page", "0").param("size", "50")),
                endpoint("approval status update", PermissionAction.UPDATE, "DISPATCH",
                        () -> patch("/api/v1/partner-approvals/{partnerCode}/status", PARTNER_CODE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"status\":\"APPROVED\"}")),
                endpoint("approval reset password", PermissionAction.UPDATE, "INVENTORY",
                        () -> post("/api/v1/partner-approvals/{partnerCode}/reset-password", PARTNER_CODE))
        );
    }

    private static EndpointCase endpoint(
            String name, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, action, role, request);
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(ROLE_HEADER, role);
    }

    private double deniedCount(String role, PermissionAction action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", PAGE,
                "role", role,
                "action", action.name()
        ).count();
    }

    private void assertRequirePermission(String method, PermissionAction expected, Class<?>... params)
            throws Exception {
        com.samhanair.logis.security.permission.RequirePermission annotation =
                PartnerApprovalsController.class.getMethod(method, params)
                        .getAnnotation(com.samhanair.logis.security.permission.RequirePermission.class);
        assertThat(annotation).as("%s 에 @RequirePermission 부착", method).isNotNull();
        assertThat(annotation.page()).isEqualTo(PAGE);
        assertThat(annotation.action()).isEqualTo(expected);
        // 거래처 본인 self-service 가 아니므로 partnerSelfService=false (PARTNER deny 유지).
        assertThat(annotation.partnerSelfService()).isFalse();
    }

    record EndpointCase(
            String name,
            PermissionAction action,
            String role,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new HeaderAuthenticationFilter(),
                            UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }

    @TestConfiguration
    static class TestMeterConfig {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
