package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import java.util.List;
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
                null);
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
        when(partnerLookupClient.findByPartnerId(PARTNER_ID))
                .thenReturn(Optional.of(new PartnerSummary(PARTNER_ID, "P-001", "삼한상사", null, null)));

        Page<CashDisbursementResponse> result = service.listCashDisbursements(
                null, null, null, null, PageRequest.of(0, 20));

        CashDisbursementResponse row = result.getContent().get(0);
        assertThat(row.slipNo()).isEqualTo("CD-20260521-001");
        assertThat(row.partnerName()).isEqualTo("삼한상사");

        String json = objectMapper.writeValueAsString(row);
        assertThat(json).contains("slipNo", "partnerName", "amount", "transactionDate", "kind");
        assertThat(json).doesNotContain(PARTNER_ID.toString(), "partnerId", "journalId", "externalRef");
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
}
