package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CollectionPlan;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.NoteType;
import com.samhanair.logis.accounting.domain.NotesReceivable;
import com.samhanair.logis.accounting.domain.PlanBasis;
import com.samhanair.logis.accounting.repository.CollectionPlanRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.NotesReceivableRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

/**
 * 채권채무 현황 IT.
 *
 * <p>실 PostgreSQL에 POSTED 분개, 받을어음, 수금계획을 시드하여 거래처별 잔액,
 * 월별 aging 버킷, 여신한도, 어음/수금계획 병기와 UUID 미노출을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ReceivablesPayablesControllerIT extends AbstractPostgresIT {

    private static final UUID PARTNER_A =
            UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    private static final UUID PARTNER_B =
            UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2");
    private static final UUID COUNTER =
            UUID.fromString("cccccccc-cccc-cccc-cccc-ccccccccccc3");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JournalRepository journalRepository;
    @Autowired private NotesReceivableRepository notesReceivableRepository;
    @Autowired private CollectionPlanRepository collectionPlanRepository;

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
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<UUID> ids = invocation.getArgument(0, List.class);
                    Map<UUID, PartnerSummary> result = new HashMap<>();
                    if (ids.contains(PARTNER_A)) {
                        result.put(PARTNER_A, new PartnerSummary(
                                PARTNER_A,
                                "P-G3-001",
                                "삼한채권상사",
                                "123-45-67890",
                                "서울",
                                new BigDecimal("10000.00")));
                    }
                    if (ids.contains(PARTNER_B)) {
                        result.put(PARTNER_B, new PartnerSummary(
                                PARTNER_B,
                                "P-G3-002",
                                "아로채무물류",
                                "222-33-44444",
                                "부산",
                                new BigDecimal("5000.00")));
                    }
                    return result;
                });
    }

    @Test
    @DisplayName("채권채무 현황 — 잔액/월별 aging/여신/어음/수금계획을 거래처별 병기하고 UUID를 노출하지 않는다")
    void receivablesPayablesReportAggregatesReadonlyData() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/receivables-payables")
                        .param("asOfDate", "1900-06-30")
                        .param("direction", "ALL")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        assertText(data.get("direction"), "ALL");
        assertAmount(data.get("receivableTotal"), "6500.00");
        assertAmount(data.get("payableTotal"), "2500.00");
        assertAmount(data.get("netTotal"), "4000.00");

        JsonNode partnerA = findLine(data, "P-G3-001");
        assertText(partnerA.get("bizNo"), "1234567890");
        assertText(partnerA.get("partnerName"), "삼한채권상사");
        assertAmount(partnerA.get("receivableBalance"), "6500.00");
        assertAmount(partnerA.get("payableBalance"), "0.00");
        assertAmount(partnerA.get("netBalance"), "6500.00");
        assertAmount(partnerA.get("agingBuckets").get("currentMonth"), "1000.00");
        assertAmount(partnerA.get("agingBuckets").get("oneMonthElapsed"), "2000.00");
        assertAmount(partnerA.get("agingBuckets").get("twoMonthsElapsed"), "0.00");
        assertAmount(partnerA.get("agingBuckets").get("threeMonthsOver"), "3500.00");
        assertAmount(partnerA.get("creditLimit"), "10000.00");
        assertAmount(partnerA.get("creditUsageRate"), "65.00");
        assertAmount(partnerA.get("notesHeldAmount"), "1000.00");
        assertAmount(partnerA.get("notesMaturingSoonAmount"), "800.00");
        assertAmount(partnerA.get("collectionPlanPlannedAmount"), "700.00");
        assertAmount(partnerA.get("collectionPlanOverdueAmount"), "300.00");
        assertAmount(partnerA.get("collectionPlanTotalAmount"), "1000.00");

        JsonNode partnerB = findLine(data, "P-G3-002");
        assertAmount(partnerB.get("receivableBalance"), "0.00");
        assertAmount(partnerB.get("payableBalance"), "2500.00");
        assertAmount(partnerB.get("netBalance"), "-2500.00");
        assertAmount(partnerB.get("agingBuckets").get("currentMonth"), "-500.00");
        assertAmount(partnerB.get("agingBuckets").get("twoMonthsElapsed"), "-2000.00");

        if (body.contains(PARTNER_A.toString())
                || body.contains(PARTNER_B.toString())
                || body.contains("\"partnerId\"")) {
            throw new AssertionError("채권채무 현황 응답에 partner UUID 가 노출되었습니다");
        }
    }

    @Test
    @DisplayName("채권채무 현황 — direction=RECEIVABLE은 채권과 수금 부속정보만 반환")
    void receivableDirectionFiltersPayables() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/receivables-payables")
                        .param("asOfDate", "1900-06-30")
                        .param("direction", "RECEIVABLE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = objectMapper.readTree(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data");
        assertAmount(data.get("receivableTotal"), "6500.00");
        assertAmount(data.get("payableTotal"), "0.00");
        findLine(data, "P-G3-001");
        assertLineMissing(data, "P-G3-002");
    }

    @Test
    @DisplayName("채권채무 현황 aging — 경과일이 1일이어도 전월 발생분은 달력월 기준 1개월로 분류")
    void agingUsesCalendarMonthNotElapsedDays() throws Exception {
        seedPosted("G3-AR-A-CALENDAR-MONTH", LocalDate.of(2026, 5, 31), "A 전월말 외상매출",
                line("1089", "100.00", "0.00", PARTNER_A, "A 외상매출"),
                line("4019", "0.00", "100.00", COUNTER, "매출"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/receivables-payables")
                        .param("asOfDate", "2026-06-01")
                        .param("direction", "RECEIVABLE")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = objectMapper.readTree(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data");
        JsonNode partnerA = findLine(data, "P-G3-001");

        assertAmount(partnerA.get("agingBuckets").get("currentMonth"), "0.00");
        assertAmount(partnerA.get("agingBuckets").get("oneMonthElapsed"), "100.00");
    }

    private void seedFixtures() {
        seedPosted("G3-AR-A-OLD", LocalDate.of(1900, 2, 1), "A 3개월+ 외상매출",
                line("1089", "5000.00", "0.00", PARTNER_A, "A 외상매출"),
                line("4019", "0.00", "5000.00", COUNTER, "매출"));
        seedPosted("G3-AR-A-ONE", LocalDate.of(1900, 5, 10), "A 1개월 미수금",
                line("1209", "2000.00", "0.00", PARTNER_A, "A 미수금"),
                line("4019", "0.00", "2000.00", COUNTER, "매출"));
        seedPosted("G3-AR-A-CUR", LocalDate.of(1900, 6, 5), "A 당월 외상매출",
                line("1089", "1000.00", "0.00", PARTNER_A, "A 외상매출"),
                line("4019", "0.00", "1000.00", COUNTER, "매출"));
        seedPosted("G3-AR-A-COLLECT", LocalDate.of(1900, 6, 15), "A 일부 수금",
                line("1019", "1500.00", "0.00", COUNTER, "현금 수금"),
                line("1089", "0.00", "1500.00", PARTNER_A, "A 수금"));
        seedPosted("G3-AP-B-TWO", LocalDate.of(1900, 4, 10), "B 2개월 외상매입",
                line("4511", "3000.00", "0.00", COUNTER, "매입"),
                line("2519", "0.00", "3000.00", PARTNER_B, "B 외상매입"));
        seedPosted("G3-AP-B-PAY", LocalDate.of(1900, 6, 20), "B 일부 지급",
                line("2519", "1000.00", "0.00", PARTNER_B, "B 지급"),
                line("101", "0.00", "1000.00", COUNTER, "현금 지급"));
        seedPosted("G3-AP-B-CUR", LocalDate.of(1900, 6, 25), "B 당월 미지급금",
                line("801", "500.00", "0.00", COUNTER, "비용"),
                line("2539", "0.00", "500.00", PARTNER_B, "B 미지급금"));

        NotesReceivable soon = NotesReceivable.register(
                PARTNER_A,
                "G3-NR-SOON",
                LocalDate.of(1900, 6, 1),
                LocalDate.of(1900, 7, 10),
                new BigDecimal("800.00"),
                NoteType.PROMISSORY,
                "만기임박");
        NotesReceivable later = NotesReceivable.register(
                PARTNER_A,
                "G3-NR-LATER",
                LocalDate.of(1900, 6, 1),
                LocalDate.of(1900, 8, 15),
                new BigDecimal("200.00"),
                NoteType.PROMISSORY,
                "보유");
        later.collect();
        notesReceivableRepository.saveAllAndFlush(List.of(soon, later));

        CollectionPlan planned = CollectionPlan.register(
                "G3-CP-PLANNED",
                PARTNER_A,
                LocalDate.of(1900, 7, 5),
                new BigDecimal("700.00"),
                PlanBasis.MANUAL,
                "예정");
        CollectionPlan overdue = CollectionPlan.register(
                "G3-CP-OVERDUE",
                PARTNER_A,
                LocalDate.of(1900, 6, 1),
                new BigDecimal("300.00"),
                PlanBasis.MANUAL,
                "연체");
        overdue.markOverdue();
        collectionPlanRepository.saveAllAndFlush(List.of(planned, overdue));
    }

    private void seedPosted(String journalNo, LocalDate date, String description, LineSpec... specs) {
        Journal journal = Journal.create(journalNo, date, description, JournalSourceType.MANUAL, null);
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
        journal.post("receivables-payables-it");
        journalRepository.saveAndFlush(journal);
    }

    private LineSpec line(String accountCode, String debit, String credit, UUID partnerId, String memo) {
        return new LineSpec(accountCode, debit, credit, partnerId, memo);
    }

    private JsonNode findLine(JsonNode data, String partnerCode) {
        for (JsonNode line : data.get("lines")) {
            if (partnerCode.equals(line.get("partnerCode").asText())) {
                return line;
            }
        }
        throw new AssertionError("채권채무 현황 라인을 찾지 못했습니다: " + partnerCode);
    }

    private void assertLineMissing(JsonNode data, String partnerCode) {
        for (JsonNode line : data.get("lines")) {
            if (partnerCode.equals(line.get("partnerCode").asText())) {
                throw new AssertionError("제외되어야 할 거래처가 포함되었습니다: " + partnerCode);
            }
        }
    }

    private void assertAmount(JsonNode node, String expected) {
        BigDecimal actual = node.decimalValue();
        BigDecimal expectedAmount = new BigDecimal(expected);
        if (actual.compareTo(expectedAmount) != 0) {
            throw new AssertionError("금액 불일치 expected=" + expectedAmount + ", actual=" + actual);
        }
    }

    private void assertText(JsonNode node, String expected) {
        if (!expected.equals(node.asText())) {
            throw new AssertionError("문자열 불일치 expected=" + expected + ", actual=" + node.asText());
        }
    }

    private record LineSpec(String accountCode, String debit, String credit, UUID partnerId, String memo) {
    }
}
