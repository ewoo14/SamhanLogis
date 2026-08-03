package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.report.FundsStatusService;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.service.CashReceiptNumberService;
import com.samhanair.logis.accounting.service.CashReceiptService;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.service.LedgerService;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.accounting.service.AccountService;
import com.samhanair.logis.accounting.service.Mig9AgingSnapshotRefreshService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * #831 Q1 대표 구 Map API 소비처의 partner-service 장애 전파 회귀 가드.
 *
 * <p>#924 개발책임자 결정(2026-07-24) 이후 — write/detail(저널 create/post/reverse/상세,
 * 입금보고서 confirm/cancel)은 표시명 공란 성사로 분기됐지만, read 리포트(본 클래스가
 * 다루는 FundsStatus/Ledger 및 아래 {@code CashReceiptService.list}) 는 그대로 502
 * fail-closed 를 유지해야 한다 — 되돌리지 않았음을 회귀 가드로 고정한다.
 */
class LegacyBatchConsumerFailClosedTest {

    private static final UUID PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final LocalDate FROM = LocalDate.of(2026, 7, 1);
    private static final LocalDate TO = LocalDate.of(2026, 7, 31);

    @Test
    void fundsStatus는_partner_service_5xx를_502로_전파한다() {
        JournalLineRepository journalLines = mock(JournalLineRepository.class);
        ChartOfAccountRepository accounts = mock(ChartOfAccountRepository.class);
        when(accounts.findAll()).thenReturn(List.of());
        PartnerAccountTotal row = partnerTotal("102");
        when(journalLines.aggregateFundsOpeningByAccountPartner(any(), any()))
                .thenReturn(List.of(row));
        when(journalLines.aggregateFundsByAccountPartner(any(), any(), any()))
                .thenReturn(List.of());

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        FundsStatusService service = new FundsStatusService(journalLines, accounts, client);
        expectUnavailable(server);

        assertThatThrownBy(() -> service.findStatus(FROM, TO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    @Test
    void ledger는_partner_service_5xx를_502로_전파한다() {
        JournalLineRepository journalLines = mock(JournalLineRepository.class);
        ChartOfAccountRepository accounts = mock(ChartOfAccountRepository.class);
        DynamicPermissionClient permissions = mock(DynamicPermissionClient.class);
        JournalLine line = mock(JournalLine.class);
        when(line.getPartnerId()).thenReturn(PARTNER_ID);
        when(journalLines.findAllPostedLinesInRange(FROM, TO)).thenReturn(List.of(line));

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        LedgerService service = new LedgerService(journalLines, accounts, client, permissions);
        expectUnavailable(server);

        assertThatThrownBy(() -> service.getLedger(FROM, TO, null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    /**
     * #924 개발책임자 결정 — CashReceiptService 는 write/detail(confirm/cancel/단건조회)만
     * 표시명 공란 성사로 분기됐고, 목록 조회(read 리포트)는 BankTransaction/CollectionPlan/
     * NotesReceivable/DailyClosing.list() 와 동일하게 fail-closed(502)를 유지한다.
     * (블랭크 폴백 회귀 가드는 {@code WriteDetailPartnerLookupBlankFallbackTest} 의
     * confirm/cancel 테스트가 대칭으로 커버한다.)
     */
    @Test
    void cashReceiptService_list은_partner_service_5xx를_502로_전파한다() {
        CashReceiptRepository repository = mock(CashReceiptRepository.class);
        BankTransactionRepository bankTransactionRepository = mock(BankTransactionRepository.class);
        JournalRepository journalRepository = mock(JournalRepository.class);
        CashReceiptNumberService numberService = mock(CashReceiptNumberService.class);
        AccountService accountService = mock(AccountService.class);
        JournalService journalService = mock(JournalService.class);
        MonthEndCloseService monthEndCloseService = mock(MonthEndCloseService.class);
        Mig9AgingSnapshotRefreshService agingSnapshotRefreshService = mock(Mig9AgingSnapshotRefreshService.class);

        CashReceipt receipt = CashReceipt.createManual("2026/07/24-1", PARTNER_ID,
                new BigDecimal("100000"), FROM, "메모", "102", "110");
        setField(receipt, "id", UUID.randomUUID());
        Pageable pageable = PageRequest.of(0, 20);
        Page<CashReceipt> page = new PageImpl<>(List.of(receipt), pageable, 1);
        when(repository.findAll(org.mockito.ArgumentMatchers.<Specification<CashReceipt>>any(),
                org.mockito.ArgumentMatchers.eq(pageable))).thenReturn(page);

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        CashReceiptService service = new CashReceiptService(repository, bankTransactionRepository,
                journalRepository, numberService, accountService, client, journalService,
                monthEndCloseService, agingSnapshotRefreshService, new ObjectMapper());
        expectUnavailable(server);

        assertThatThrownBy(() -> service.list(null, null, null, null, FROM, TO, null, null, pageable))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static PartnerLookupClient client(RestClient.Builder builder) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        // #831 R-6: 프로덕션 생성자가 이제 자체 timeout requestFactory 를 설정해 MockRestServiceServer
        // 의 mock requestFactory 를 덮어쓰므로, 여기서 baseUrl 만 적용해 직접 build() 한 뒤 테스트
        // 전용 생성자로 주입한다(mock requestFactory 는 build() 이전에 이미 builder 에 반영돼 있음).
        return new PartnerLookupClient(builder.baseUrl("http://partner-service").build(), props, new ObjectMapper());
    }

    private static PartnerAccountTotal partnerTotal(String accountCode) {
        return new PartnerAccountTotal() {
            @Override public UUID getPartnerId() { return PARTNER_ID; }
            @Override public String getAccountCode() { return accountCode; }
            @Override public JournalSourceType getSourceType() { return null; }
            @Override public BigDecimal getDebitTotal() { return BigDecimal.ONE; }
            @Override public BigDecimal getCreditTotal() { return BigDecimal.ZERO; }
        };
    }

    private static void expectUnavailable(MockRestServiceServer server) {
        server.expect(requestTo("http://partner-service/internal/partners/lookup-by-ids"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
    }
}
