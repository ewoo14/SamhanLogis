package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.security.InternalAuthProperties;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * #924 개발책임자 결정(2026-07-24) — write/detail 경로는 표시명(거래처 이름) 조회가
 * partner-service 장애(UNAVAILABLE)여도 오퍼레이션을 롤백하지 않고 공란/미조회로 성사시킨다.
 *
 * <p>read 리포트(PartnerAging 등)는 그대로 502 fail-closed 를 유지해야 하므로
 * {@link com.samhanair.logis.accounting.client.LegacyBatchConsumerFailClosedTest} 의 회귀
 * 가드와 대칭을 이루는 write/detail 전용 가드다.
 *
 * <p>{@link PartnerLookupClient} 는 {@code @MockBean}/Mockito mock 을 쓰지 않고 실 client 를
 * {@link MockRestServiceServer} 에 바인딩해 5xx 를 실제로 흘려보낸다 — client mock 이 UNAVAILABLE
 * 표현 자체를 우회해버리는 false-green 을 피하기 위함이다(재수렴 지적: LUNA 12소비처 sweep 이
 * {@code @MockBean(Map.of() 반환)} 이라 실 502/공란 전환을 재현하지 못했던 것과 동일한 함정).
 */
class WriteDetailPartnerLookupBlankFallbackTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 7, 24);

    // ------------------------------------------------------------------
    // JournalService — create / post / reverse (toDetailResponse 공용 경로)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("create — partner-service 장애에도 분개를 생성(DRAFT)하고 거래처명은 공란이다")
    void createSucceedsWithBlankPartnerNameWhenPartnerServiceUnavailable() {
        JournalRepository journalRepository = mock(JournalRepository.class);
        JournalNumberService journalNumberService = mock(JournalNumberService.class);
        AccountService accountService = mock(AccountService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        ApprovalLineAuthorizeClient approvalLineAuthorizeClient = mock(ApprovalLineAuthorizeClient.class);
        ChartOfAccountRepository chartOfAccountRepository = mock(ChartOfAccountRepository.class);
        CashReceiptRepository cashReceiptRepository = mock(CashReceiptRepository.class);

        when(journalNumberService.next(any())).thenReturn("2026/07/24-1");
        when(monthEndCloseService.findClosedPeriodCovering(any())).thenReturn(Optional.empty());
        when(journalRepository.save(any(Journal.class))).thenAnswer(inv -> inv.getArgument(0));
        when(chartOfAccountRepository.findAllById(any())).thenReturn(List.of());

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        expectUnavailable(server, ExpectedCount.once());

        JournalService service = new JournalService(journalRepository, journalNumberService, accountService,
                monthEndCloseService, approvalLineAuthorizeClient, client, chartOfAccountRepository,
                cashReceiptRepository);

        UUID partnerId = UUID.randomUUID();
        CreateJournalRequest req = new CreateJournalRequest(TODAY, "테스트 분개",
                List.of(new CreateJournalLineRequest("101", new BigDecimal("100000"), BigDecimal.ZERO,
                                partnerId, "현금 입금"),
                        new CreateJournalLineRequest("401", BigDecimal.ZERO, new BigDecimal("100000"),
                                null, "상품매출")));

        JournalDetailResponse resp = service.create(req);

        assertThat(resp.status()).isEqualTo(JournalStatus.DRAFT);
        assertThat(resp.totalDebit()).isEqualByComparingTo("100000");
        assertThat(resp.totalCredit()).isEqualByComparingTo("100000");
        assertThat(resp.lines().get(0).partnerName()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("post — partner-service 장애에도 DRAFT→POSTED 게시를 성사시키고 거래처명은 공란이다")
    void postSucceedsWithBlankPartnerNameWhenPartnerServiceUnavailable() {
        JournalRepository journalRepository = mock(JournalRepository.class);
        JournalNumberService journalNumberService = mock(JournalNumberService.class);
        AccountService accountService = mock(AccountService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        ApprovalLineAuthorizeClient approvalLineAuthorizeClient = mock(ApprovalLineAuthorizeClient.class);
        ChartOfAccountRepository chartOfAccountRepository = mock(ChartOfAccountRepository.class);
        CashReceiptRepository cashReceiptRepository = mock(CashReceiptRepository.class);

        when(monthEndCloseService.findClosedPeriodCovering(any())).thenReturn(Optional.empty());
        when(chartOfAccountRepository.findAllById(any())).thenReturn(List.of());

        UUID partnerId = UUID.randomUUID();
        Journal draft = Journal.create("2026/07/24-1", TODAY, "테스트", JournalSourceType.MANUAL, (UUID) null);
        setField(draft, "id", UUID.randomUUID());
        draft.addLine(JournalLine.create(draft, 1, "101", new BigDecimal("100000"), BigDecimal.ZERO,
                partnerId, "현금"));
        draft.addLine(JournalLine.create(draft, 2, "401", BigDecimal.ZERO, new BigDecimal("100000"),
                null, "매출"));
        when(journalRepository.findById(draft.getId())).thenReturn(Optional.of(draft));

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        expectUnavailable(server, ExpectedCount.once());

        JournalService service = new JournalService(journalRepository, journalNumberService, accountService,
                monthEndCloseService, approvalLineAuthorizeClient, client, chartOfAccountRepository,
                cashReceiptRepository);

        // actorUserId="system" → parseRealUserId 가 null 로 취급해 결재라인 강제(enforceApprovalLine)를
        // 건너뛴다(JournalService 기존 관례, approvalLineAuthorizeClient 미스텁으로 충분).
        JournalDetailResponse resp = service.post(draft.getId(), "system");

        assertThat(resp.status()).isEqualTo(JournalStatus.POSTED);
        assertThat(resp.lines().get(0).partnerName()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("reverse — partner-service 장애에도 차/대 swap 역분개 생성을 성사시키고 거래처명은 공란이다")
    void reverseSucceedsWithBlankPartnerNameWhenPartnerServiceUnavailable() {
        JournalRepository journalRepository = mock(JournalRepository.class);
        JournalNumberService journalNumberService = mock(JournalNumberService.class);
        AccountService accountService = mock(AccountService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        ApprovalLineAuthorizeClient approvalLineAuthorizeClient = mock(ApprovalLineAuthorizeClient.class);
        ChartOfAccountRepository chartOfAccountRepository = mock(ChartOfAccountRepository.class);
        CashReceiptRepository cashReceiptRepository = mock(CashReceiptRepository.class);

        when(monthEndCloseService.findClosedPeriodCovering(any())).thenReturn(Optional.empty());
        when(chartOfAccountRepository.findAllById(any())).thenReturn(List.of());
        when(journalNumberService.next(TODAY)).thenReturn("2026/07/24-2");

        UUID partnerId = UUID.randomUUID();
        Journal original = Journal.create("2026/07/24-1", TODAY, "테스트", JournalSourceType.MANUAL, (UUID) null);
        setField(original, "id", UUID.randomUUID());
        original.addLine(JournalLine.create(original, 1, "101", new BigDecimal("100000"), BigDecimal.ZERO,
                partnerId, "현금"));
        original.addLine(JournalLine.create(original, 2, "401", BigDecimal.ZERO, new BigDecimal("100000"),
                null, "매출"));
        original.post("user-A");
        when(journalRepository.findById(original.getId())).thenReturn(Optional.of(original));
        UUID reversalId = UUID.randomUUID();
        when(journalRepository.save(any(Journal.class))).thenAnswer(inv -> {
            Journal saved = inv.getArgument(0);
            setField(saved, "id", reversalId);
            return saved;
        });

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        expectUnavailable(server, ExpectedCount.once());

        JournalService service = new JournalService(journalRepository, journalNumberService, accountService,
                monthEndCloseService, approvalLineAuthorizeClient, client, chartOfAccountRepository,
                cashReceiptRepository);

        JournalDetailResponse resp = service.reverse(original.getId(), "system");

        assertThat(resp.status()).isEqualTo(JournalStatus.POSTED);
        assertThat(resp.journalNo()).isEqualTo("2026/07/24-2");
        // 차/대 swap 된 첫 라인도 원 partnerId 를 승계하지만 표시명은 공란.
        assertThat(resp.lines().get(0).partnerName()).isNull();
        assertThat(original.getStatus()).isEqualTo(JournalStatus.REVERSED);
        server.verify();
    }

    // ------------------------------------------------------------------
    // CashReceiptService — confirm / cancel (responseOf 공용 경로)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("confirm — partner-service 장애에도 확정+자동분개 게시를 성사시키고 거래처 표시는 미조회 기본값이다")
    void confirmSucceedsWithBlankPartnerDisplayWhenPartnerServiceUnavailable() {
        CashReceiptRepository repository = mock(CashReceiptRepository.class);
        BankTransactionRepository bankTransactionRepository = mock(BankTransactionRepository.class);
        JournalRepository journalRepository = mock(JournalRepository.class);
        CashReceiptNumberService numberService = mock(CashReceiptNumberService.class);
        AccountService accountService = mock(AccountService.class);
        JournalService journalService = mock(JournalService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        Mig9AgingSnapshotRefreshService agingSnapshotRefreshService = mock(Mig9AgingSnapshotRefreshService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        UUID partnerId = UUID.randomUUID();
        UUID receiptId = UUID.randomUUID();
        UUID journalId = UUID.randomUUID();
        CashReceipt receipt = CashReceipt.createManual("2026/07/24-1", partnerId, new BigDecimal("100000"),
                TODAY, "입금", "102", "110");
        setField(receipt, "id", receiptId);
        when(repository.findById(receiptId)).thenReturn(Optional.of(receipt));
        when(monthEndCloseService.findClosedPeriodCovering(any())).thenReturn(Optional.empty());
        Journal postedJournal = Journal.create("2026/07/24-1", TODAY, "입금보고서 확정 2026/07/24-1",
                JournalSourceType.CASH_RECEIPT, receiptId);
        setField(postedJournal, "id", journalId);
        when(journalService.postAutoJournal(any(), any(), any(), any(), any(), any()))
                .thenReturn(postedJournal);
        when(journalRepository.findAllById(any())).thenReturn(List.of());

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        // confirm() 은 적요용 partnerNameSuffix(1회) + 최종 responseOf(1회) = batch 조회 2회.
        expectUnavailable(server, ExpectedCount.times(2));

        CashReceiptService service = new CashReceiptService(repository, bankTransactionRepository,
                journalRepository, numberService, accountService, client, journalService,
                monthEndCloseService, agingSnapshotRefreshService, objectMapper);

        CashReceiptResponse resp = service.confirm(receiptId, "system");

        assertThat(resp.status()).isEqualTo(CashReceiptStatus.CONFIRMED);
        assertThat(resp.partnerCode()).isEqualTo("미등록");
        assertThat(resp.partnerName()).isEqualTo("(미조회)");
        assertThat(receipt.getJournalId()).isEqualTo(journalId);
        server.verify();
    }

    @Test
    @DisplayName("cancel — partner-service 장애에도 취소+자동 역분개 게시를 성사시키고 거래처 표시는 미조회 기본값이다")
    void cancelSucceedsWithBlankPartnerDisplayWhenPartnerServiceUnavailable() {
        CashReceiptRepository repository = mock(CashReceiptRepository.class);
        BankTransactionRepository bankTransactionRepository = mock(BankTransactionRepository.class);
        JournalRepository journalRepository = mock(JournalRepository.class);
        CashReceiptNumberService numberService = mock(CashReceiptNumberService.class);
        AccountService accountService = mock(AccountService.class);
        JournalService journalService = mock(JournalService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        Mig9AgingSnapshotRefreshService agingSnapshotRefreshService = mock(Mig9AgingSnapshotRefreshService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        UUID partnerId = UUID.randomUUID();
        UUID receiptId = UUID.randomUUID();
        UUID originalJournalId = UUID.randomUUID();
        UUID reversalJournalId = UUID.randomUUID();

        CashReceipt receipt = CashReceipt.createManual("2026/07/24-1", partnerId, new BigDecimal("100000"),
                TODAY, "입금", "102", "110");
        setField(receipt, "id", receiptId);
        receipt.confirm();
        receipt.linkJournal(originalJournalId);
        when(repository.findById(receiptId)).thenReturn(Optional.of(receipt));

        Journal reversal = Journal.create("2026/07/24-2", TODAY, "[역분개] 2026/07/24-1",
                JournalSourceType.CASH_RECEIPT, originalJournalId);
        setField(reversal, "id", reversalJournalId);
        when(journalService.autoReverse(originalJournalId, "system")).thenReturn(reversal);
        when(journalRepository.findAllById(any())).thenReturn(List.of());

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        // cancel() 은 responseOf 1회만 batch 조회한다 (partnerNameSuffix 미사용).
        expectUnavailable(server, ExpectedCount.once());

        CashReceiptService service = new CashReceiptService(repository, bankTransactionRepository,
                journalRepository, numberService, accountService, client, journalService,
                monthEndCloseService, agingSnapshotRefreshService, objectMapper);

        CashReceiptResponse resp = service.cancel(receiptId, "system");

        assertThat(resp.status()).isEqualTo(CashReceiptStatus.CANCELLED);
        assertThat(resp.partnerCode()).isEqualTo("미등록");
        assertThat(resp.partnerName()).isEqualTo("(미조회)");
        assertThat(receipt.getReverseJournalId()).isEqualTo(reversalJournalId);
        server.verify();
    }

    // ------------------------------------------------------------------
    // 헬퍼 — LegacyBatchConsumerFailClosedTest 와 동일 패턴(실 client + MockRestServiceServer).
    // ------------------------------------------------------------------

    private static PartnerLookupClient client(RestClient.Builder builder) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        return new PartnerLookupClient(builder, props, new ObjectMapper());
    }

    private static void expectUnavailable(MockRestServiceServer server, ExpectedCount count) {
        server.expect(count, requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field f = findField(target.getClass(), fieldName);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static Field findField(Class<?> clazz, String name) throws NoSuchFieldException {
        Class<?> c = clazz;
        while (c != null) {
            try {
                return c.getDeclaredField(name);
            } catch (NoSuchFieldException ex) {
                c = c.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }
}
