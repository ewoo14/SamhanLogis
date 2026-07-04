package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.accounting.domain.Order;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.accounting.repository.OrderRepository;
import com.samhanair.logis.accounting.web.dto.OrderDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AccountingAdminQueryServiceTest {

    private static final UUID PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID PRODUCT_ID =
            UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Mock private OrderRepository orderRepository;
    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private AccountingAdminQueryService service;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        service = new AccountingAdminQueryService(orderRepository, jdbcTemplate);
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
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
    void getOrderDetail_hyphenPathId_fallsBackToSlashStoredOrderNo() {
        Order order = Order.fromMig8Staging(
                "2026/05/20-1",
                PARTNER_ID,
                "삼한상사",
                "김매니저",
                LocalDate.of(2026, 6, 30),
                "월말결제",
                "긴급",
                OrderProgressStatus.IN_PROGRESS,
                "runtime:order:1");
        when(orderRepository.findByOrderNo("2026-05-20-1")).thenReturn(Optional.empty());
        when(orderRepository.findByOrderNo("2026/05/20-1")).thenReturn(Optional.of(order));

        OrderDetailResponse response = service.getOrderDetail("2026-05-20-1");

        assertThat(response.orderNo()).isEqualTo("2026/05/20-1");
    }

    @Test
    void getOrderDetail_hyphenStoredMig8OrderNo_stillResolvesOriginalValueFirst() {
        Order order = Order.fromMig8Staging(
                "2026-05-20-1",
                PARTNER_ID,
                "삼한상사",
                "김매니저",
                LocalDate.of(2026, 6, 30),
                "월말결제",
                "긴급",
                OrderProgressStatus.IN_PROGRESS,
                "mig8:order:1");
        when(orderRepository.findByOrderNo("2026-05-20-1")).thenReturn(Optional.of(order));

        OrderDetailResponse response = service.getOrderDetail("2026-05-20-1");

        assertThat(response.orderNo()).isEqualTo("2026-05-20-1");
    }

    @Test
    void ledgerDailyDiff_usesUnfilteredRawDailyTotals() {
        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<Object>>any()))
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
                org.mockito.ArgumentMatchers.<RowMapper<Object>>any());
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("raw_totals");
        assertThat(sql).contains("GROUP BY transaction_date");
        assertThat(sql).doesNotContain("SUM(total_amount) OVER (PARTITION BY transaction_date)");
    }
}
