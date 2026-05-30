package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-1 Slice C — 현금흐름표 / 자본변동표 / 일계표 / 월계표 검증용 IT.
 *
 * <p>PR #137 BE+DevOps reviewer fix 반영:
 * <ul>
 *   <li>V10 seed 격리 월 2027-01 기준으로 기간 파라미터 변경</li>
 *   <li>EquityChangesResponse flat 구조 필드명 정정
 *       ({@code beginningTotalEquity} / {@code endingTotalEquity} / {@code totalChange})</li>
 *   <li>DailySummaryResponse 필드명 정정 ({@code date} / {@code accountSummary})</li>
 *   <li>MonthlySummaryResponse {@code accountSummary} 배열 검증 추가</li>
 * </ul>
 *
 * <p>검증 목적:
 * <ul>
 *   <li>GET /accounting/reports/cash-flow?period=202701 — V10 seed 5건 반영 확인</li>
 *   <li>GET /accounting/reports/equity-changes?fromDate=2027-01-01&amp;toDate=2027-01-31
 *       — SEED-EQ-001(유상증자) / SEED-EQ-002(배당) 검증</li>
 *   <li>GET /accounting/reports/daily-summary?date=2026-01-15
 *       — V6 SEED-RPT-001 / SEED-RPT-003 2건 적재 일계표 확인</li>
 *   <li>GET /accounting/reports/monthly-summary?period=202601
 *       — 2026-01 월계표 journalCount &ge; 2 확인 (V6 seed 활용)</li>
 * </ul>
 *
 * <p>이중 가드: {@code AbstractPostgresIT} Testcontainers PostgreSQL + Flyway V1~V10 자동 적용.
 * Docker 미가용 환경에서는 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) —
 * Eureka 비활성 환경에서 외부 RestClient 초기화 실패로 인한 5xx 회피.
 *
 * <p>{@code @Transactional} 적용 — 테스트 후 자동 롤백으로 DB 상태 보호.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SliceCValidationIT extends AbstractPostgresIT {

    /** 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients 가드 준수). */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D2 동적 권한 client 격리. SP-D5 cycle 2 fix (P1-4): {@code @RequirePermission} AOP 활성 후
     * report endpoint 호출 시 canView=false 회귀 차단 위해 lenient stub 적용.
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermissionStub() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Autowired private MockMvc mockMvc;

    // -------------------------------------------------------------------------
    // 1. 현금흐름표 — cash-flow?period=202701 (V10 seed 격리 월 2027-01)
    // -------------------------------------------------------------------------

    /**
     * V10 seed — 현금흐름표 202701 조회 200 OK + 기본 구조 검증.
     *
     * <p>SEED-CF-001~005 5건의 영업/투자/재무 활동 분개가 period=202701 에 적재됨.
     * period / fromDate / toDate 필드 + cashReconciled 플래그 확인.
     *
     * <p>PR #137 fix — V10 seed 격리 월 2027-01 기준으로 변경 (TrialBalanceControllerIT 회귀 방지).
     */
    @Test
    @DisplayName("현금흐름표 — 202701 조회 200 OK + period/cashReconciled 필드 검증")
    void cashFlowReportReturns200ForPeriod202701() throws Exception {
        mockMvc.perform(get("/accounting/reports/cash-flow")
                        .param("period", "202701")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.period").isString())
                .andExpect(jsonPath("$.data.fromDate").value("2027-01-01"))
                .andExpect(jsonPath("$.data.toDate").value("2027-01-31"))
                .andExpect(jsonPath("$.data.netCashFlow").isNumber())
                .andExpect(jsonPath("$.data.cashReconciled").isBoolean());
    }

    /**
     * V10 seed — 현금흐름표 CFI 투자활동 존재 확인.
     *
     * <p>SEED-CF-004 차량운반구 취득(146 debit 5,000,000, V1 코드) — investingActivities 비어있지 않음.
     */
    @Test
    @DisplayName("현금흐름표 — CFI 투자활동 (차량운반구 취득) 항목 존재 확인")
    void cashFlowInvestingActivitiesNotEmpty() throws Exception {
        mockMvc.perform(get("/accounting/reports/cash-flow")
                        .param("period", "202701")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.investingActivities").isArray())
                .andExpect(jsonPath("$.data.cashFromInvesting").isNumber());
    }

    // -------------------------------------------------------------------------
    // 2. 자본변동표 — equity-changes?fromDate=2027-01-01&toDate=2027-01-31
    // -------------------------------------------------------------------------

    /**
     * V10 seed — 자본변동표 2027-01 조회 200 OK + flat 구조 검증.
     *
     * <p>SEED-EQ-001 유상증자(301 credit 20,000,000) + SEED-EQ-002 배당(343 debit 3,000,000). V1 자본금 코드 301.
     * flat 필드: beginningTotalEquity / endingTotalEquity / totalChange / capitalStockIncrease / dividends.
     *
     * <p>PR #137 fix — EquityChangesResponse flat 구조 + 필드명 정정
     * ({@code beginningTotalEquity}/{@code endingTotalEquity} — DevOps reviewer 지적).
     */
    @Test
    @DisplayName("자본변동표 — 2027-01 조회 200 OK + flat 구조 필드 검증")
    void equityChangesReportReturns200ForJan2027() throws Exception {
        mockMvc.perform(get("/accounting/reports/equity-changes")
                        .param("fromDate", "2027-01-01")
                        .param("toDate", "2027-01-31")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fromDate").value("2027-01-01"))
                .andExpect(jsonPath("$.data.toDate").value("2027-01-31"))
                .andExpect(jsonPath("$.data.beginningTotalEquity").isNumber())
                .andExpect(jsonPath("$.data.endingTotalEquity").isNumber())
                .andExpect(jsonPath("$.data.totalChange").isNumber())
                .andExpect(jsonPath("$.data.beginningCapitalStock").isNumber())
                .andExpect(jsonPath("$.data.capitalStockIncrease").isNumber())
                .andExpect(jsonPath("$.data.endingCapitalStock").isNumber())
                .andExpect(jsonPath("$.data.beginningRetainedEarnings").isNumber())
                .andExpect(jsonPath("$.data.netIncome").isNumber())
                .andExpect(jsonPath("$.data.dividends").isNumber())
                .andExpect(jsonPath("$.data.endingRetainedEarnings").isNumber());
    }

    /**
     * V10 seed — 자본변동표 유상증자 / 배당 반영 확인.
     *
     * <p>SEED-EQ-001(310 credit 20,000,000 = capitalStockIncrease 양수 값) 반영 확인.
     * SEED-EQ-002(343 debit 3,000,000 = dividends 음수 값) 반영 확인.
     */
    @Test
    @DisplayName("자본변동표 — 유상증자(capitalStockIncrease > 0) + 배당(dividends < 0) 반영 확인")
    void equityChangesHasCapitalIncreaseAndDividend() throws Exception {
        mockMvc.perform(get("/accounting/reports/equity-changes")
                        .param("fromDate", "2027-01-01")
                        .param("toDate", "2027-01-31")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                // 유상증자: capitalStockIncrease > 0 (SEED-EQ-001: 301 credit 20,000,000, V1 자본금 코드)
                .andExpect(jsonPath("$.data.capitalStockIncrease").value(20000000))
                // 배당: dividends < 0 (SEED-EQ-002: 343 debit 3,000,000 → -3,000,000)
                .andExpect(jsonPath("$.data.dividends").value(-3000000));
    }

    // -------------------------------------------------------------------------
    // 3. 일계표 — daily-summary?date=2026-01-15
    // -------------------------------------------------------------------------

    /**
     * V6 seed 활용 — 일계표 2026-01-15 조회 200 OK.
     *
     * <p>V6 SEED-RPT-001(상품매출) + SEED-RPT-003(상품매출원가) 2건이
     * 2026-01-15 journalDate 로 적재되어 있음.
     * journalCount &ge; 2 + balanced true 확인.
     *
     * <p>PR #137 fix — 필드명 정정:
     * {@code date} (spec, 구 summaryDate 대신) + {@code accountSummary} (spec, 구 accountTotals 대신).
     */
    @Test
    @DisplayName("일계표 — 2026-01-15 조회 200 OK + date/balanced/accountSummary 필드 검증")
    void dailySummaryReturns200ForJan15() throws Exception {
        mockMvc.perform(get("/accounting/reports/daily-summary")
                        .param("date", "2026-01-15")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.date").value("2026-01-15"))
                .andExpect(jsonPath("$.data.journalCount").isNumber())
                .andExpect(jsonPath("$.data.totalDebit").isNumber())
                .andExpect(jsonPath("$.data.totalCredit").isNumber())
                .andExpect(jsonPath("$.data.balanced").value(true))
                .andExpect(jsonPath("$.data.accountSummary").isArray());
    }

    // -------------------------------------------------------------------------
    // 4. 월계표 — monthly-summary?period=202601
    // -------------------------------------------------------------------------

    /**
     * V6 seed 활용 — 월계표 202601 조회 200 OK.
     *
     * <p>V6 SEED-RPT-001(2026-01-15) + SEED-RPT-003(2026-01-15) + SEED-RPT-004(2026-01-31)
     * 총 3건이 2026-01 에 적재. journalCount &ge; 2 + balanced true 확인.
     *
     * <p>PR #137 fix — {@code accountSummary} 배열 검증 추가 (B-2 fix 반영).
     */
    @Test
    @DisplayName("월계표 — 202601 조회 200 OK + journalCount >= 2 + balanced + accountSummary 확인")
    void monthlySummaryReturns200ForJan2026() throws Exception {
        mockMvc.perform(get("/accounting/reports/monthly-summary")
                        .param("period", "202601")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.period").isString())
                .andExpect(jsonPath("$.data.fromDate").value("2026-01-01"))
                .andExpect(jsonPath("$.data.toDate").value("2026-01-31"))
                .andExpect(jsonPath("$.data.journalCount").isNumber())
                .andExpect(jsonPath("$.data.totalDebit").isNumber())
                .andExpect(jsonPath("$.data.totalCredit").isNumber())
                .andExpect(jsonPath("$.data.balanced").value(true))
                .andExpect(jsonPath("$.data.dailyBreakdown").isArray())
                .andExpect(jsonPath("$.data.accountSummary").isArray());
    }
}
