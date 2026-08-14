package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.report.ReportPermissionGuard;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/** 전표현황 보고서 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class JournalStatusReportControllerIT extends AbstractPostgresIT {

    private static final UUID PARTNER_WILLY =
            UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PARTNER_HANIL =
            UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID PARTNER_NAVER =
            UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JournalRepository journalRepository;

    /** 외부 e-Tax client 격리. */
    @MockBean private ETaxClient eTaxClient;
    /** 외부 KFTC client 격리. */
    @MockBean private KftcClient kftcClient;
    /** partner-service lookup client 격리. */
    @MockBean private PartnerLookupClient partnerLookupClient;
    /** 동적 권한 client 격리. */
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPartnerLookup() {
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode("P-WILLY-001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_WILLY, "P-WILLY-001", "주식회사 윌리", "111-11-11111", null)));
        lenient().when(partnerLookupClient.findByPartnerCode("P-HANIL-002"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_HANIL, "P-HANIL-002", "한일빌딩", "222-22-22222", null)));
        lenient().when(partnerLookupClient.findByPartnerCode("P-NAVER-003"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_NAVER, "P-NAVER-003", "네이버", "333-33-33333", null)));
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<UUID> ids = invocation.getArgument(0, List.class);
                    Map<UUID, PartnerSummary> names = new HashMap<>();
                    if (ids.contains(PARTNER_WILLY)) {
                        names.put(PARTNER_WILLY,
                                new PartnerSummary(PARTNER_WILLY, "P-WILLY-001", "주식회사 윌리", "111-11-11111", null));
                    }
                    if (ids.contains(PARTNER_HANIL)) {
                        names.put(PARTNER_HANIL,
                                new PartnerSummary(PARTNER_HANIL, "P-HANIL-002", "한일빌딩", "222-22-22222", null));
                    }
                    if (ids.contains(PARTNER_NAVER)) {
                        names.put(PARTNER_NAVER,
                                new PartnerSummary(PARTNER_NAVER, "P-NAVER-003", "네이버", "333-33-33333", null));
                    }
                    return names;
                });
    }

    @Test
    @DisplayName("전표현황 — sourceType 다중 필터와 거래유형 한글 라벨")
    void journalStatusFiltersBySourceTypesAndLabels() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .param("sourceTypes", "SLIP", "CLOSING")
                        .param("groupBy", "SOURCE_TYPE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        if (data.get("groups").size() != 2) {
            throw new AssertionError("sourceType 그룹 수가 예상과 다릅니다: " + data.get("groups").size());
        }
        assertGroup(data, "전표", "전표", 1, "5000.00");
        assertGroup(data, "결산", "결산", 1, "2000.00");
        assertAmount(data.get("total").get("totalDebit"), "7000.00");
        if (body.contains("수기")) {
            throw new AssertionError("SLIP/CLOSING 필터 결과에 MANUAL 라벨이 포함되었습니다");
        }
        assertNoPartnerUuid(body);
    }

    @Test
    @DisplayName("전표현황 — partnerCode 필터를 내부 UUID 로 해석하고 거래처별 grouping 소계")
    void journalStatusFiltersByPartnerCodeAndGroupsByPartner() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .param("partnerCode", "P-WILLY-001")
                        .param("groupBy", "PARTNER")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        if (data.get("groups").size() != 1) {
            throw new AssertionError("거래처 그룹 수가 예상과 다릅니다: " + data.get("groups").size());
        }
        JsonNode group = data.get("groups").get(0);
        if (!"주식회사 윌리".equals(group.get("groupLabel").asText())) {
            throw new AssertionError("거래처 그룹명이 예상과 다릅니다: " + group.get("groupLabel").asText());
        }
        if (group.get("lines").size() != 1) {
            throw new AssertionError("거래처 필터 라인 수가 예상과 다릅니다: " + group.get("lines").size());
        }
        JsonNode line = group.get("lines").get(0);
        if (!"SLIP".equals(line.get("sourceType").asText())) {
            throw new AssertionError("거래처 필터 전표 출처가 예상과 다릅니다: " + line.get("sourceType").asText());
        }
        if (!"1111111111".equals(line.get("bizNo").asText())) {
            throw new AssertionError("거래처코드(bizNo) 숫자화가 예상과 다릅니다: " + line.get("bizNo").asText());
        }
        assertAmount(group.get("subtotal").get("totalDebit"), "5000.00");
        assertAmount(data.get("total").get("totalCredit"), "5000.00");
        assertNoPartnerUuid(body);
    }

    @Test
    @DisplayName("전표현황 — PARTNER grouping 은 복합전표를 라인 거래처별 fan-out 한다")
    void journalStatusPartnerGroupingFansOutMultiPartnerJournal() throws Exception {
        seedPosted("STATUS-F-MULTI-PARTNER", LocalDate.of(2026, 6, 6), "복합 거래처 전표",
                JournalSourceType.MANUAL,
                line("102", "1000.00", "0.00", PARTNER_WILLY, "윌리 차변"),
                line("401", "0.00", "1000.00", PARTNER_HANIL, "한일 대변"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-06")
                        .param("to", "2026-06-06")
                        .param("groupBy", "PARTNER")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        if (data.get("groups").size() != 2) {
            throw new AssertionError("복합전표 fan-out 그룹 수가 예상과 다릅니다: " + data.get("groups").size());
        }
        assertGroup(data, "주식회사 윌리", "수기", 1, "1000.00");
        assertGroup(data, "한일빌딩", "수기", 1, "0.00");
        assertAmount(findGroup(data, "한일빌딩").get("subtotal").get("totalCredit"), "1000.00");
        assertAmount(data.get("total").get("totalDebit"), "1000.00");
        assertAmount(data.get("total").get("totalCredit"), "1000.00");
        assertNoPartnerUuid(body);
    }

    @Test
    @DisplayName("전표현황 — 복합전표 다중 거래처명과 사업자번호는 같은 정렬 순서로 join 한다")
    void journalStatusMultiPartnerBizNoKeepsSeparatorAndNameOrder() throws Exception {
        seedPosted("STATUS-F-MULTI-JOIN", LocalDate.of(2026, 6, 9), "다중 거래처 표시",
                JournalSourceType.MANUAL,
                line("102", "1500.00", "0.00", PARTNER_WILLY, "윌리 차변"),
                line("401", "0.00", "1500.00", PARTNER_NAVER, "네이버 대변"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-09")
                        .param("to", "2026-06-09")
                        .param("groupBy", "DATE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode line = objectMapper.readTree(body).get("data")
                .get("groups").get(0)
                .get("lines").get(0);

        if (!"네이버 / 주식회사 윌리".equals(line.get("partnerName").asText())) {
            throw new AssertionError("복합전표 거래처명 join 순서가 예상과 다릅니다: "
                    + line.get("partnerName").asText());
        }
        if (!"3333333333 / 1111111111".equals(line.get("bizNo").asText())) {
            throw new AssertionError("복합전표 사업자번호 join 구분자/순서가 예상과 다릅니다: "
                    + line.get("bizNo").asText());
        }
        assertNoPartnerUuid(body);
    }

    @Test
    @DisplayName("전표현황 — KFTC_DEPOSIT 과 CASH_RECEIPT 라벨을 구분한다")
    void journalStatusDistinguishesDepositAndCashReceiptLabels() throws Exception {
        seedPosted("STATUS-F-KFTC", LocalDate.of(2026, 6, 7), "계좌 입금",
                JournalSourceType.KFTC_DEPOSIT,
                line("102", "1200.00", "0.00", PARTNER_WILLY, "계좌입금"),
                line("401", "0.00", "1200.00", PARTNER_WILLY, "매출"));
        seedPosted("STATUS-F-CASH", LocalDate.of(2026, 6, 8), "현금 입금",
                JournalSourceType.CASH_RECEIPT,
                line("101", "800.00", "0.00", PARTNER_HANIL, "입금보고서"),
                line("401", "0.00", "800.00", PARTNER_HANIL, "매출"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-07")
                        .param("to", "2026-06-08")
                        .param("sourceTypes", "KFTC_DEPOSIT", "CASH_RECEIPT")
                        .param("groupBy", "SOURCE_TYPE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse()
                .getContentAsString(StandardCharsets.UTF_8)).get("data");
        assertGroup(data, "계좌입금", "계좌입금", 1, "1200.00");
        assertGroup(data, "입금보고서", "입금보고서", 1, "800.00");
    }

    @Test
    @DisplayName("전표현황 — partner-service UNAVAILABLE을 0건 성공으로 숨기지 않는다")
    void journalStatusPartnerUnavailableReturnsExplicitError() throws Exception {
        when(partnerLookupClient.findByPartnerCodeResult("P-DOWN"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .param("partnerCode", "P-DOWN")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadGateway());
    }

    @Test
    @DisplayName("전표현황 — 무필터 조회에서 partner-service UNAVAILABLE을 0건 성공으로 숨기지 않는다 (#831 B-2)")
    void journalStatusUnfilteredPartnerUnavailableReturnsExplicitError() throws Exception {
        seedFixtures();
        when(partnerLookupClient.findByPartnerIdsBatchResult(anyList()))
                .thenReturn(PartnerLookupClient.BatchLookupResult.unavailable());

        mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadGateway());
    }

    @Test
    @DisplayName("전표현황 — groupBy=PARTNER 무필터 조회에서 UNAVAILABLE을 \"(미조회)\" 단일 병합으로 숨기지 않는다 (#831 B-2)")
    void journalStatusPartnerGroupByUnfilteredUnavailableReturnsExplicitError() throws Exception {
        seedFixtures();
        when(partnerLookupClient.findByPartnerIdsBatchResult(anyList()))
                .thenReturn(PartnerLookupClient.BatchLookupResult.unavailable());

        mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .param("groupBy", "PARTNER")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadGateway());
    }

    @Test
    @DisplayName("전표현황 — 무필터 조회에서 일부 거래처 미매칭(삭제)은 장애가 아니라 \"(미조회)\" 로 무회귀한다")
    void journalStatusUnresolvedPartnerIsNotTreatedAsUnavailable() throws Exception {
        UUID deletedPartner = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");
        seedPosted("STATUS-F-DELETED-PARTNER", LocalDate.of(2026, 6, 10), "삭제거래처 라인",
                JournalSourceType.MANUAL,
                line("102", "700.00", "0.00", deletedPartner, "삭제거래처 차변"),
                line("401", "0.00", "700.00", deletedPartner, "삭제거래처 대변"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-10")
                        .param("to", "2026-06-10")
                        .param("groupBy", "DATE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode line = objectMapper.readTree(body).get("data")
                .get("groups").get(0)
                .get("lines").get(0);
        if (!"(미조회)".equals(line.get("partnerName").asText())) {
            throw new AssertionError("삭제 거래처 표시가 예상과 다릅니다: " + line.get("partnerName").asText());
        }
    }

    @Test
    @DisplayName("전표현황 — VIEW 권한 deny 시 403")
    void journalStatusDeniedPermissionReturns403() throws Exception {
        denyRequirePermission(ReportPermissionGuard.PAGE_CODE, PermissionAction.VIEW);

        mockMvc.perform(get("/accounting/reports/journal-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("기존 결재 첨부 분개 검색 endpoint 는 무회귀")
    void existingJournalSearchStillWorks() throws Exception {
        seedFixtures();

        mockMvc.perform(get("/admin/accounting/journals/search")
                        .param("q", "STATUS-F-SLIP")
                        .param("limit", "5")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
    }

    private void seedFixtures() {
        seedPosted("STATUS-F-SLIP", LocalDate.of(2026, 6, 3), "출고전표",
                JournalSourceType.SLIP,
                line("102", "5000.00", "0.00", PARTNER_WILLY, "입금"),
                line("401", "0.00", "5000.00", PARTNER_WILLY, "매출"));
        seedPosted("STATUS-F-MANUAL", LocalDate.of(2026, 6, 4), "수기 지급",
                JournalSourceType.MANUAL,
                line("801", "3000.00", "0.00", PARTNER_HANIL, "임차료"),
                line("102", "0.00", "3000.00", PARTNER_HANIL, "출금"));
        seedPosted("STATUS-F-CLOSING", LocalDate.of(2026, 6, 30), "결산 전표",
                JournalSourceType.CLOSING,
                line("302", "2000.00", "0.00", PARTNER_NAVER, "결산"),
                line("901", "0.00", "2000.00", PARTNER_NAVER, "결산"));
        seedDraft("STATUS-F-DRAFT", LocalDate.of(2026, 6, 5), "미게시 제외",
                JournalSourceType.SLIP,
                line("102", "999.00", "0.00", PARTNER_WILLY, "미게시"),
                line("401", "0.00", "999.00", PARTNER_WILLY, "미게시"));
    }

    private void seedPosted(String journalNo, LocalDate date, String description,
                            JournalSourceType sourceType, LineSpec... specs) {
        Journal journal = journal(journalNo, date, description, sourceType, specs);
        journal.post("journal-status-it");
        journalRepository.saveAndFlush(journal);
    }

    private void seedDraft(String journalNo, LocalDate date, String description,
                           JournalSourceType sourceType, LineSpec... specs) {
        journalRepository.saveAndFlush(journal(journalNo, date, description, sourceType, specs));
    }

    private Journal journal(String journalNo, LocalDate date, String description,
                            JournalSourceType sourceType, LineSpec... specs) {
        Journal journal = Journal.create(journalNo, date, description, sourceType, null);
        int lineNo = 1;
        for (LineSpec spec : specs) {
            journal.addLine(JournalLine.create(
                    journal,
                    lineNo++,
                    spec.accountCode(),
                    new BigDecimal(spec.debit()),
                    new BigDecimal(spec.credit()),
                    spec.partnerId(),
                    spec.memo()
            ));
        }
        return journal;
    }

    private LineSpec line(String accountCode, String debit, String credit, UUID partnerId, String memo) {
        return new LineSpec(accountCode, debit, credit, partnerId, memo);
    }

    private void assertGroup(JsonNode data, String groupLabel, String sourceLabel,
                             int expectedCount, String expectedDebit) {
        JsonNode group = findGroup(data, groupLabel);
        if (group.get("lines").size() != expectedCount) {
            throw new AssertionError("그룹 라인 수가 예상과 다릅니다: " + groupLabel);
        }
        if (!sourceLabel.equals(group.get("lines").get(0).get("sourceTypeDisplayName").asText())) {
            throw new AssertionError("거래유형 라벨이 예상과 다릅니다: " + groupLabel);
        }
        assertAmount(group.get("subtotal").get("totalDebit"), expectedDebit);
    }

    private JsonNode findGroup(JsonNode data, String groupLabel) {
        for (JsonNode group : data.get("groups")) {
            if (groupLabel.equals(group.get("groupLabel").asText())) {
                return group;
            }
        }
        throw new AssertionError("그룹을 찾지 못했습니다: " + groupLabel);
    }

    private void assertAmount(JsonNode node, String expected) {
        BigDecimal actual = node.decimalValue();
        BigDecimal expectedAmount = new BigDecimal(expected);
        if (actual.compareTo(expectedAmount) != 0) {
            throw new AssertionError("금액 불일치 expected=" + expectedAmount + ", actual=" + actual);
        }
    }

    private void assertNoPartnerUuid(String body) {
        if (body.contains(PARTNER_WILLY.toString())
                || body.contains(PARTNER_HANIL.toString())
                || body.contains(PARTNER_NAVER.toString())) {
            throw new AssertionError("전표현황 응답에 partner UUID 가 노출되었습니다");
        }
    }

    private record LineSpec(String accountCode, String debit, String credit, UUID partnerId, String memo) {
    }
}
