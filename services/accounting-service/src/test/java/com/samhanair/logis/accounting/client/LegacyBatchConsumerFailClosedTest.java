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
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.report.FundsStatusService;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.service.LedgerService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** #831 Q1 대표 구 Map API 소비처의 partner-service 장애 전파 회귀 가드. */
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

    private static PartnerLookupClient client(RestClient.Builder builder) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        return new PartnerLookupClient(builder, props, new ObjectMapper());
    }

    private static PartnerAccountTotal partnerTotal(String accountCode) {
        return new PartnerAccountTotal() {
            @Override public UUID getPartnerId() { return PARTNER_ID; }
            @Override public String getAccountCode() { return accountCode; }
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
