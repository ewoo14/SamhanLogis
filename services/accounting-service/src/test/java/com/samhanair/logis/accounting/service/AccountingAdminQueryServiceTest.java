package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashDisbursement;
import com.samhanair.logis.accounting.domain.CashKind;
import com.samhanair.logis.accounting.domain.Order;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.accounting.repository.CashDisbursementRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.OrderRepository;
import com.samhanair.logis.accounting.web.dto.CashDisbursementResponse;
import com.samhanair.logis.accounting.web.dto.OrderDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AccountingAdminQueryServiceTest {

    private static final UUID PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID PRODUCT_ID =
            UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Mock private CashDisbursementRepository cashDisbursementRepository;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private JournalRepository journalRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private AccountingAdminQueryService service;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        service = new AccountingAdminQueryService(
                cashDisbursementRepository,
                cashReceiptRepository,
                orderRepository,
                journalRepository,
                partnerLookupClient,
                jdbcTemplate);
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    }

    @Test
    void cashDisbursementResponse_usesBusinessIdentifiersAndDoesNotExposeUuid() throws Exception {
        CashDisbursement disbursement = CashDisbursement.fromMig7Staging(
                "CD-20260521-001",
                PARTNER_ID,
                new BigDecimal("120000.00"),
                LocalDate.of(2026, 5, 21),
                CashKind.EXPENSE_VOUCHER,
                "운송비",
                "mig7:row:1");
        when(cashDisbursementRepository.findAll(
                any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(disbursement)));
        when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(PARTNER_ID, "삼한상사"));

        Page<CashDisbursementResponse> result = service.listCashDisbursements(
                null, null, null, null, null, PageRequest.of(0, 20));

        CashDisbursementResponse row = result.getContent().get(0);
        assertThat(row.slipNo()).isEqualTo("CD-20260521-001");
        assertThat(row.partnerName()).isEqualTo("삼한상사");

        String json = objectMapper.writeValueAsString(row);
        assertThat(json).contains("slipNo", "partnerName", "amount", "transactionDate", "kind");
        assertThat(json).doesNotContain(PARTNER_ID.toString(), "partnerId", "journalId", "externalRef");
    }

    @Test
    void cashDisbursementList_resolvesPartnerNamesWithSingleBatchCallForFiftyRows() {
        List<CashDisbursement> rows = java.util.stream.IntStream.range(0, 50)
                .mapToObj(i -> CashDisbursement.fromMig7Staging(
                        "CD-20260521-" + String.format("%03d", i),
                        UUID.nameUUIDFromBytes(("partner-" + i).getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                        new BigDecimal("1000.00"),
                        LocalDate.of(2026, 5, 21),
                        CashKind.EXPENSE_VOUCHER,
                        "운송비",
                        "mig7:row:" + i))
                .toList();
        Map<UUID, String> names = new LinkedHashMap<>();
        rows.forEach(row -> names.put(row.getPartnerId(), "거래처-" + row.getSlipNo()));
        when(cashDisbursementRepository.findAll(
                any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(rows, PageRequest.of(0, 50), 50));
        when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(names);

        Page<CashDisbursementResponse> result = service.listCashDisbursements(
                null, null, null, null, null, PageRequest.of(0, 50));

        assertThat(result.getContent()).hasSize(50);
        org.mockito.ArgumentCaptor<List<UUID>> idsCaptor =
                org.mockito.ArgumentCaptor.forClass(List.class);
        verify(partnerLookupClient).findByPartnerIdsBatch(idsCaptor.capture());
        assertThat(idsCaptor.getValue()).hasSize(50);
        verify(partnerLookupClient, never()).findByPartnerId(any());
    }

    @Test
    void orderDetailResponse_hidesOrderAndProductUuidFromLines() throws Exception {
        Order order = Order.fromMig8Staging(
                "OR-20260521-001",
                PARTNER_ID,
                "삼한상사",
                "김매니저",
                LocalDate.of(2026, 6, 30),
                "월말결제",
                "긴급",
                OrderProgressStatus.IN_PROGRESS,
                "mig8:order:1");
        order.addLine(1, PRODUCT_ID, "항공 운송", new BigDecimal("2.000"),
                new BigDecimal("50000.00"), new BigDecimal("100000.00"),
                new BigDecimal("10000.00"), LocalDate.of(2026, 6, 1));
        when(orderRepository.findByOrderNo("OR-20260521-001")).thenReturn(Optional.of(order));

        OrderDetailResponse response = service.getOrderDetail("OR-20260521-001");

        assertThat(response.orderNo()).isEqualTo("OR-20260521-001");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().get(0).itemName()).isEqualTo("항공 운송");

        String json = objectMapper.writeValueAsString(response);
        assertThat(json).contains("orderNo", "partnerName", "managerName", "progressStatus", "lines");
        assertThat(json).doesNotContain(PARTNER_ID.toString(), PRODUCT_ID.toString(),
                "partnerId", "productId", "managerEmployeeId", "externalRef");
    }

    @Test
    void ledgerDailyDiff_usesUnfilteredRawDailyTotals() {
        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of());

        service.listSalesLedger(
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                "삼한",
                "TRANSFORMED",
                PageRequest.of(0, 20));

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbcTemplate).query(
                sqlCaptor.capture(),
                any(MapSqlParameterSource.class),
                any(RowMapper.class));
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("raw_totals");
        assertThat(sql).contains("GROUP BY transaction_date");
        assertThat(sql).doesNotContain("SUM(total_amount) OVER (PARTITION BY transaction_date)");
    }

    @Test
    void agingSnapshot_usesPageableLimitOffsetAndCountQuery() {
        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of());

        Page<?> result = service.listAgingSnapshot(
                PageRequest.of(2, 600), "삼한", "net_cash_desc");

        assertThat(result.getTotalElements()).isZero();
        org.mockito.ArgumentCaptor<MapSqlParameterSource> paramsCaptor =
                org.mockito.ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbcTemplate).query(
                anyString(),
                paramsCaptor.capture(),
                any(RowMapper.class));
        MapSqlParameterSource params = paramsCaptor.getValue();
        assertThat(params.getValue("limit")).isEqualTo(500);
        assertThat(params.getValue("offset")).isEqualTo(1000L);
    }
}
