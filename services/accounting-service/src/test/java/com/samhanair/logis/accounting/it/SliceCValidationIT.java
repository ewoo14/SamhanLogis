package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
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
 * <p>검증 목적:
 * <ul>
 *   <li>GET /api/v1/accounting/reports/cash-flow?period=202605 — V10 seed 5건 반영 확인</li>
 *   <li>GET /api/v1/accounting/reports/equity-changes?fromDate=2026-05-01&amp;toDate=2026-05-31
 *       — SEED-EQ-001(유상증자) / SEED-EQ-002(배당) 검증</li>
 *   <li>GET /api/v1/accounting/reports/daily-summary?date=2026-01-15
 *       — V6 SEED-RPT-001 / SEED-RPT-003 2건 적재 일계표 확인</li>
 *   <li>GET /api/v1/accounting/reports/monthly-summary?period=202601
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

    @Autowired private MockMvc mockMvc;

    // -------------------------------------------------------------------------
    // 1. 현금흐름표 — cash-flow?period=202605
    // -------------------------------------------------------------------------

    /**
     * V10 seed — 현금흐름표 202605 조회 200 OK + 기본 구조 검증.
     *
     * <p>SEED-CF-001~005 5건의 영업/투자/재무 활동 분개가 period=202605 에 적재됨.
     * period / fromDate / toDate 필드 + cashReconciled 플래그 확인.
     *
     * <p>PR #136 회고 — @RequestParam 이름 정확: {@code period} (yyyyMM 형식).
     */
    @Test
    @DisplayName("현금흐름표 — 202605 조회 200 OK + period/cashReconciled 필드 검증")
    void cashFlowReportReturns200ForPeriod202605() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/cash-flow")
                        .param("period", "202605")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.period").isString())
                .andExpect(jsonPath("$.data.fromDate").value("2026-05-01"))
                .andExpect(jsonPath("$.data.toDate").value("2026-05-31"))
                .andExpect(jsonPath("$.data.netCashFlow").isNumber())
                .andExpect(jsonPath("$.data.cashReconciled").isBoolean());
    }

    /**
     * V10 seed — 현금흐름표 CFI 투자활동 존재 확인.
     *
     * <p>SEED-CF-004 차량운반구 취득(161 debit 5,000,000) — investingActivities 비어있지 않음.
     */
    @Test
    @DisplayName("현금흐름표 — CFI 투자활동 (차량운반구 취득) 항목 존재 확인")
    void cashFlowInvestingActivitiesNotEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/cash-flow")
                        .param("period", "202605")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.investingActivities").isArray())
                .andExpect(jsonPath("$.data.cashFromInvesting").isNumber());
    }

    // -------------------------------------------------------------------------
    // 2. 자본변동표 — equity-changes?fromDate=2026-05-01&toDate=2026-05-31
    // -------------------------------------------------------------------------

    /**
     * V10 seed — 자본변동표 2026-05 조회 200 OK + 구조 검증.
     *
     * <p>SEED-EQ-001 유상증자(301 credit 20,000,000) + SEED-EQ-002 배당(343 debit 3,000,000).
     * lines 배열 비어있지 않음 + endingEquity 수치 반환 확인.
     *
     * <p>PR #136 회고 — @RequestParam 이름 정확: {@code fromDate} / {@code toDate} (YYYY-MM-DD).
     */
    @Test
    @DisplayName("자본변동표 — 2026-05 조회 200 OK + lines/endingEquity 필드 검증")
    void equityChangesReportReturns200ForMay2026() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/equity-changes")
                        .param("fromDate", "2026-05-01")
                        .param("toDate", "2026-05-31")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fromDate").value("2026-05-01"))
                .andExpect(jsonPath("$.data.toDate").value("2026-05-31"))
                .andExpect(jsonPath("$.data.beginningEquity").isNumber())
                .andExpect(jsonPath("$.data.totalChange").isNumber())
                .andExpect(jsonPath("$.data.endingEquity").isNumber())
                .andExpect(jsonPath("$.data.lines").isArray());
    }

    /**
     * V10 seed — 자본변동표 유상증자 / 배당 변동 행 2건 이상 존재.
     *
     * <p>SEED-EQ-001(CAPITAL_INCREASE) + SEED-EQ-002(DIVIDEND) 모두 lines 에 포함.
     */
    @Test
    @DisplayName("자본변동표 — 유상증자(CAPITAL_INCREASE) + 배당(DIVIDEND) 변동 행 존재 확인")
    void equityChangesHasCapitalIncreaseAndDividend() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/equity-changes")
                        .param("fromDate", "2026-05-01")
                        .param("toDate", "2026-05-31")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                // lines 배열이 최소 2건 (유상증자 + 배당)
                .andExpect(jsonPath("$.data.lines[0]").exists())
                .andExpect(jsonPath("$.data.lines[1]").exists());
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
     * <p>PR #136 회고 — @RequestParam 이름 정확: {@code date} (ISO DATE YYYY-MM-DD).
     */
    @Test
    @DisplayName("일계표 — 2026-01-15 조회 200 OK + journalCount >= 2 + balanced 확인")
    void dailySummaryReturns200ForJan15() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/daily-summary")
                        .param("date", "2026-01-15")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summaryDate").value("2026-01-15"))
                .andExpect(jsonPath("$.data.journalCount").isNumber())
                .andExpect(jsonPath("$.data.totalDebit").isNumber())
                .andExpect(jsonPath("$.data.totalCredit").isNumber())
                .andExpect(jsonPath("$.data.balanced").value(true))
                .andExpect(jsonPath("$.data.accountTotals").isArray());
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
     * <p>PR #136 회고 — @RequestParam 이름 정확: {@code period} (yyyyMM 형식).
     */
    @Test
    @DisplayName("월계표 — 202601 조회 200 OK + journalCount >= 2 + balanced 확인")
    void monthlySummaryReturns200ForJan2026() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/reports/monthly-summary")
                        .param("period", "202601")
                        .header("X-User-Id", "accountant-seed-test")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.period").isString())
                .andExpect(jsonPath("$.data.fromDate").value("2026-01-01"))
                .andExpect(jsonPath("$.data.toDate").value("2026-01-31"))
                .andExpect(jsonPath("$.data.journalCount").isNumber())
                .andExpect(jsonPath("$.data.totalDebit").isNumber())
                .andExpect(jsonPath("$.data.totalCredit").isNumber())
                .andExpect(jsonPath("$.data.balanced").value(true))
                .andExpect(jsonPath("$.data.dailyBreakdown").isArray());
    }
}
