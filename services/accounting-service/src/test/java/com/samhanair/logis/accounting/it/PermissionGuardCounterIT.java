package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.RequirePermission;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * SP-D5 {@code permission_guard_denied_total} Counter IT — audit Slice A.
 *
 * <p>QA P1 보고: SP-D5 에서 {@link PermissionGuardMetrics} Counter 신규 도입 후
 * IT 수준 Counter 노출 + 증가 검증 없음 → 본 IT 로 gap 보완.
 *
 * <h2>검증 시나리오 (3 케이스)</h2>
 * <ol>
 *   <li><b>Case 1 — VIEW deny → Counter 1 증가</b>
 *       {@link com.samhanair.logis.accounting.report.BalanceSheetController}
 *       {@code @RequirePermission(page="accounting.reports", action="VIEW")} 부착 endpoint 호출.
 *       {@link DynamicPermissionClient#canView} mock false → 403.
 *       {@link MeterRegistry} 에서 Counter
 *       {@code permission_guard_denied_total{service=accounting-service,page=accounting.reports,role=DRIVER,action=VIEW}}
 *       count = 1 검증.</li>
 *   <li><b>Case 2 — EDIT deny (view-only override) → Counter 1 증가</b>
 *       {@link PermissionGuardCounterIT.TestEditController} (테스트 전용)
 *       {@code @RequirePermission(page="accounting.reports", action="EDIT")} 부착 endpoint 호출.
 *       canEdit=false + canView=true → 403.
 *       Counter action="EDIT" count = 1 검증.</li>
 *   <li><b>Case 3 — EDIT fallback (canEdit=false + canView=false) → Counter 0</b>
 *       동일 EDIT endpoint 호출. canEdit=false + canView=false → fallback 통과 → 200.
 *       Counter 증가 없음 (count = 0) 검증.</li>
 * </ol>
 *
 * <p>외부 client {@code @MockBean} 격리 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}):
 * 모든 외부 RestClient {@code @MockBean} + lenient stub 의무.
 *
 * <p>{@link TestEditController} — EDIT action {@link RequirePermission} 부착 테스트 전용 controller.
 * accounting-service 본 코드에 EDIT @RequirePermission endpoint 가 없으므로
 * {@link TestConfiguration} + {@link Import} 로 Spring Boot 컨텍스트에 주입한다.
 *
 * @see PermissionGuardMetrics
 * @see com.samhanair.logis.security.permission.PermissionAspect
 * @since audit-slice-a-followup-cleanup (SP-D5 audit 후속)
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@Import(PermissionGuardCounterIT.TestEditControllerConfig.class)
@SuppressWarnings("deprecation") // accounting DynamicPermissionClient는 SP-D6+ 시점에 제거 예정 (기존 IT 패턴 일관)
class PermissionGuardCounterIT extends AbstractPostgresIT {

    // ── 테스트 대상 endpoint 상수 ───────────────────────────────────────────

    /** Case 1: VIEW deny → balance-sheet endpoint (BalanceSheetController). */
    private static final String BALANCE_SHEET_URL =
            "/api/v1/accounting/reports/balance-sheet?asOfDate=" + LocalDate.now();

    /** Case 2/3: EDIT endpoint (테스트 전용 TestEditController). */
    private static final String EDIT_REPORT_URL = "/test/permission/edit-report";

    /** Counter tag 검증 기준 — spring.application.name (accounting-service). */
    private static final String SERVICE_NAME = "accounting-service";

    /** Case 1 role: DRIVER — 회계 보고서 VIEW 권한이 부여되지 않는 역할. */
    private static final String ROLE_DRIVER = "DRIVER";

    /** Case 2/3 role: SALES — accounting.reports EDIT override row 조작 대상. */
    private static final String ROLE_SALES = "SALES";

    // ── @Autowired ──────────────────────────────────────────────────────────

    @Autowired private MockMvc mockMvc;

    /** Micrometer MeterRegistry — Counter 값 직접 조회. */
    @Autowired private MeterRegistry meterRegistry;

    // ── @MockBean 외부 client 격리 ──────────────────────────────────────────

    /**
     * SP-D5 핵심 — PermissionAspect 가 내부적으로 {@link ObjectProvider}를 통해
     * accounting-service 의 {@link DynamicPermissionClient} bean 을 발견한다.
     * 이 mock 이 Counter 증가 여부를 결정한다.
     */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    /** 외부 client 격리 — ApplicationContext 등록 보장. */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;

    /**
     * 기본 lenient stub — canView=true, canEdit=true.
     * 각 케이스에서 override 하여 deny 시나리오를 만든다.
     * lenient stub 기본값으로 기존 IT 회귀 0건을 보장한다.
     */
    @BeforeEach
    void setupLenientStubs() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    // ── Case 1: VIEW deny → Counter 1 증가 ─────────────────────────────────

    /**
     * Case 1: VIEW deny → Counter 1 증가 검증.
     *
     * <p>BalanceSheetController GET /api/v1/accounting/reports/balance-sheet
     * {@code @RequirePermission(page="accounting.reports", action="VIEW")} 부착.
     * DRIVER role 에 canView=false mock → PermissionAspect 가 403 응답 + Counter 1 증가.
     *
     * <p>Counter tag:
     * {@code service=accounting-service, page=accounting.reports, role=DRIVER, action=VIEW}
     */
    @Test
    @DisplayName("Case 1: VIEW deny (canView=false) → 403 + Counter 1 증가")
    void case1_viewDeny_counter_1() throws Exception {
        // given: DRIVER role → canView=false (명시적 deny)
        when(dynamicPermissionClient.canView(eq(ROLE_DRIVER), eq("accounting.reports")))
                .thenReturn(false);

        // when: balance-sheet endpoint 호출
        mockMvc.perform(get(BALANCE_SHEET_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", ROLE_DRIVER))
                .andExpect(status().isForbidden());

        // then: Counter 1 증가 검증
        double count = readCounter("accounting.reports", ROLE_DRIVER, "VIEW");
        assertThat(count)
                .as("VIEW deny → permission_guard_denied_total{service=%s, page=accounting.reports, " +
                        "role=DRIVER, action=VIEW} = 1", SERVICE_NAME)
                .isEqualTo(1.0);
    }

    // ── Case 2: EDIT deny (view-only override) → Counter 1 증가 ───────────

    /**
     * Case 2: EDIT deny (view-only override) → Counter 1 증가 검증.
     *
     * <p>TestEditController GET /test/permission/edit-report
     * {@code @RequirePermission(page="accounting.reports", action="EDIT")} 부착.
     * canEdit=false + canView=true → view-only override → 403 + Counter 1 증가.
     *
     * <p>PermissionAspect EDIT 정책:
     * canEdit=false + canView=true → deny → Counter increment + AccessDeniedException.
     *
     * <p>Counter tag:
     * {@code service=accounting-service, page=accounting.reports, role=SALES, action=EDIT}
     */
    @Test
    @DisplayName("Case 2: EDIT deny + canView=true (view-only override) → 403 + Counter 1 증가")
    void case2_editDeny_viewOnlyOverride_counter_1() throws Exception {
        // given: canEdit=false + canView=true → view-only override deny
        when(dynamicPermissionClient.canEdit(eq(ROLE_SALES), eq("accounting.reports")))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(eq(ROLE_SALES), eq("accounting.reports")))
                .thenReturn(true);

        // when: EDIT endpoint 호출
        mockMvc.perform(get(EDIT_REPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", ROLE_SALES))
                .andExpect(status().isForbidden());

        // then: EDIT Counter 1 증가 검증
        double count = readCounter("accounting.reports", ROLE_SALES, "EDIT");
        assertThat(count)
                .as("EDIT deny (view-only) → permission_guard_denied_total{service=%s, " +
                        "page=accounting.reports, role=SALES, action=EDIT} = 1", SERVICE_NAME)
                .isEqualTo(1.0);
    }

    // ── Case 3: EDIT fallback (canEdit=false + canView=false) → Counter 0 ──

    /**
     * Case 3: EDIT fallback (canEdit=false + canView=false) → Counter 0 검증.
     *
     * <p>PermissionAspect EDIT 정책:
     * canEdit=false + canView=false → override row 없음 (fallback 통과).
     * deny 하지 않으므로 Counter 증가 없음.
     *
     * <p>TestEditController 는 fallback 통과 후 200 을 반환한다.
     *
     * <p>Counter tag:
     * {@code service=accounting-service, page=accounting.reports, role=SALES, action=EDIT}
     * 값 = 0 (Counter 미등록 또는 등록 후 count=0).
     */
    @Test
    @DisplayName("Case 3: EDIT fallback (canEdit=false + canView=false) → 200 + Counter 0 (deny 없음)")
    void case3_editFallback_counter_0() throws Exception {
        // given: canEdit=false + canView=false → fallback 통과
        when(dynamicPermissionClient.canEdit(eq(ROLE_SALES), eq("accounting.reports")))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(eq(ROLE_SALES), eq("accounting.reports")))
                .thenReturn(false);

        // when: EDIT endpoint 호출 → fallback 통과 → 200
        mockMvc.perform(get(EDIT_REPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", ROLE_SALES))
                .andExpect(status().isOk());

        // then: Counter 증가 없음 (0) 검증
        double count = readCounter("accounting.reports", ROLE_SALES, "EDIT");
        assertThat(count)
                .as("EDIT fallback → Counter 증가 없음 (deny 미발생), count = 0")
                .isEqualTo(0.0);
    }

    // ── 헬퍼 ───────────────────────────────────────────────────────────────

    /**
     * MeterRegistry 에서 Counter 현재 count 를 조회한다.
     *
     * <p>Counter 가 아직 등록되지 않은 경우 0.0 을 반환한다.
     *
     * @param page   Counter tag {@code page} 값
     * @param role   Counter tag {@code role} 값
     * @param action Counter tag {@code action} 값
     * @return Counter count 값 (double)
     */
    private double readCounter(String page, String role, String action) {
        io.micrometer.core.instrument.Counter counter = meterRegistry.find(
                        PermissionGuardMetrics.COUNTER_NAME)
                .tag("service", SERVICE_NAME)
                .tag("page", page)
                .tag("role", role)
                .tag("action", action)
                .counter();
        return counter == null ? 0.0 : counter.count();
    }

    // ── 테스트 전용 EDIT Controller 구성 ────────────────────────────────────

    /**
     * {@link TestEditController} bean 등록을 위한 테스트 전용 구성 클래스.
     *
     * <p>accounting-service 본 코드에 EDIT action {@link RequirePermission} 부착 endpoint 가 없으므로,
     * 본 {@link TestConfiguration} 으로 EDIT endpoint 를 가진 controller 를 컨텍스트에 추가한다.
     *
     * <p>{@link Import} 로 주 {@link SpringBootTest} 에 주입된다.
     */
    @TestConfiguration
    static class TestEditControllerConfig {

        /**
         * EDIT action {@link RequirePermission} 검증용 테스트 전용 controller bean.
         *
         * @return {@link TestEditController} bean
         */
        @org.springframework.context.annotation.Bean
        public TestEditController testEditController() {
            return new TestEditController();
        }
    }

    /**
     * EDIT action {@link RequirePermission} 부착 테스트 전용 REST controller.
     *
     * <p>accounting-service 본 코드에 {@code action="EDIT"} 부착 endpoint 가 없어
     * Case 2/3 시나리오 재현을 위해 테스트 전용으로 작성한다.
     *
     * <p>endpoint: {@code GET /test/permission/edit-report}
     * 대상 페이지 코드: {@code accounting.reports} (BalanceSheetController 와 동일 — 비교 용이)
     */
    @RestController
    @RequestMapping("/test/permission")
    static class TestEditController {

        /**
         * EDIT action {@link RequirePermission} 검증 endpoint.
         *
         * <p>PermissionAspect 가 canEdit + canView 조합으로 deny / fallback 정책을 결정한다.
         *
         * @param roleHeader X-User-Role 헤더 (AOP 에서 자동 추출)
         * @return 통과 시 200 OK ApiResponse
         */
        @GetMapping("/edit-report")
        @RequirePermission(page = "accounting.reports", action = "EDIT")
        public ApiResponse<String> editReport(
                @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
            return ApiResponse.ok("edit-report-ok");
        }
    }
}
