package com.samhanair.logis.inventory.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** inventory-service accounting-service journal RestClient contract test. */
class AccountingClientTest {

    private static final String TOKEN = "test-token-xyz";
    private static final String ENDPOINT = "http://accounting-service/internal/accounting/journals";

    private MockRestServiceServer server;
    private AccountingClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new AccountingClient(builder, props);
    }

    @Test
    void createAuditAdjustmentJournal_positiveDiff_postsInventoryDebitAndLossCredit() {
        UUID auditId = UUID.fromString("00000000-0000-0000-0000-000000000101");

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.journalDate").value("2026-06-20"))
                .andExpect(jsonPath("$.description").value("재고 실사 자동 분개 (AUD-2026-001)"))
                .andExpect(jsonPath("$.lines[0].accountCode").value("1462"))
                .andExpect(jsonPath("$.lines[0].debitAmount").value(15000))
                .andExpect(jsonPath("$.lines[0].creditAmount").value(0))
                .andExpect(jsonPath("$.lines[1].accountCode").value("9399"))
                .andExpect(jsonPath("$.lines[1].debitAmount").value(0))
                .andExpect(jsonPath("$.lines[1].creditAmount").value(15000))
                .andRespond(withSuccess());

        client.createAuditAdjustmentJournal(auditId, "AUD-2026-001",
                LocalDate.of(2026, 6, 20), new BigDecimal("15000"));

        server.verify();
    }

    @Test
    void createAuditAdjustmentJournal_negativeDiff_postsLossDebitAndInventoryCredit() {
        UUID auditId = UUID.fromString("00000000-0000-0000-0000-000000000102");

        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(jsonPath("$.journalDate").value("2026-06-21"))
                .andExpect(jsonPath("$.description").value("재고 실사 자동 분개 (AUD-2026-002)"))
                .andExpect(jsonPath("$.lines[0].accountCode").value("9399"))
                .andExpect(jsonPath("$.lines[0].debitAmount").value(2700))
                .andExpect(jsonPath("$.lines[0].creditAmount").value(0))
                .andExpect(jsonPath("$.lines[1].accountCode").value("1462"))
                .andExpect(jsonPath("$.lines[1].debitAmount").value(0))
                .andExpect(jsonPath("$.lines[1].creditAmount").value(2700))
                .andRespond(withSuccess());

        client.createAuditAdjustmentJournal(auditId, "AUD-2026-002",
                LocalDate.of(2026, 6, 21), new BigDecimal("-2700"));

        server.verify();
    }

    @Test
    void createAuditAdjustmentJournal_zeroDiff_failsBeforeCallingServer() {
        assertThatThrownBy(() -> client.createAuditAdjustmentJournal(
                        UUID.fromString("00000000-0000-0000-0000-000000000103"),
                        "AUD-2026-003", LocalDate.of(2026, 6, 22), BigDecimal.ZERO))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void createAuditAdjustmentJournal_4xx_mapsToInvalidInput() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.createAuditAdjustmentJournal(
                        UUID.fromString("00000000-0000-0000-0000-000000000104"),
                        "AUD-2026-004", LocalDate.of(2026, 6, 23), BigDecimal.ONE))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void createAuditAdjustmentJournal_5xx_mapsToInternalError() {
        server.expect(requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.createAuditAdjustmentJournal(
                        UUID.fromString("00000000-0000-0000-0000-000000000105"),
                        "AUD-2026-005", LocalDate.of(2026, 6, 24), BigDecimal.TEN))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void token_blank_mapsToInternalErrorBeforeCallingServer() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        AccountingClient noTokenClient = new AccountingClient(RestClient.builder(), props);

        assertThatThrownBy(() -> noTokenClient.createAuditAdjustmentJournal(
                        UUID.fromString("00000000-0000-0000-0000-000000000106"),
                        "AUD-2026-006", LocalDate.of(2026, 6, 25), BigDecimal.ONE))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
    }
}
