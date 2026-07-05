package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@ExtendWith(MockitoExtension.class)
class SalesAccountingSlipServiceTest {

    @Mock SalesAccountingSlipRepository slipRepository;
    @Mock SalesAccountingSlipAllocationRepository allocationRepository;
    @Mock SlipServiceClient slipServiceClient;
    @Mock SalesAccountingSlipNumberGenerator numberGenerator;
    @Mock EntityManager entityManager;
    @Mock Query advisoryQuery;
    SalesAccountingSlipCreateAttemptService createAttemptService;
    SalesAccountingSlipService service;

    @BeforeEach
    void setUp() {
        lenient().when(entityManager.createNativeQuery(anyString())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.setParameter(anyString(), any())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.getSingleResult()).thenReturn(1);
        createAttemptService = new SalesAccountingSlipCreateAttemptService(
                slipRepository,
                allocationRepository,
                slipServiceClient,
                numberGenerator,
                entityManager);
        service = new SalesAccountingSlipService(slipRepository, createAttemptService);
    }

    @Test
    void list_필터_조회_응답매핑() {
        LocalDate from = LocalDate.of(2026, 5, 1);
        LocalDate to = LocalDate.of(2026, 5, 31);
        SalesAccountingSlip slip = postedSlip("SAS-LIST-1", LocalDate.of(2026, 5, 20),
                "P-001", "테스트거래처", new BigDecimal("100000.00"), new BigDecimal("10000.00"));
        when(slipRepository.findByFilters(from, to, "P-001", SalesSlipStatus.POSTED))
                .thenReturn(List.of(slip));

        List<SalesAccountingSlipResponse> responses =
                service.list(from, to, "P-001", SalesSlipStatus.POSTED);

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).slipNo()).isEqualTo("SAS-LIST-1");
        assertThat(responses.get(0).partnerCode()).isEqualTo("P-001");
        assertThat(responses.get(0).status()).isEqualTo("POSTED");
        assertThat(responses.get(0).lines()).hasSize(1);
        assertThat(responses.get(0).lines().get(0).allocations()).hasSize(1);
        verify(slipRepository).findByFilters(from, to, "P-001", SalesSlipStatus.POSTED);
    }

    @Test
    void createDraft_1대1_정상생성_VAT자동분리() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-1");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, "RX다배관",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(SalesAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "테스트",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000")))
                )));

        SalesAccountingSlipResponse resp = service.createDraft(req, "actor-1");

        assertThat(resp.slipNo()).isEqualTo("2026/05/19-1");
        assertThat(resp.status()).isEqualTo("DRAFT");
        assertThat(resp.totalSupplyAmount()).isEqualByComparingTo("1363636");
        assertThat(resp.totalVatAmount()).isEqualByComparingTo("136364");
        assertThat(resp.totalAmount()).isEqualByComparingTo("1500000");
    }

    @Test
    void overAllocation_차단_SAS_OVER_ALLOCATION() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, "P", 10,
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("800000"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("5"), new BigDecimal("160000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "OUT-X", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("800000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여를 초과")
                .hasMessageContaining("전표=")
                .hasMessageNotContaining("slip=")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
    }

    @Test
    void overAllocation_정확boundary_next가_lineTotal이면_허용() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-2");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-B", sourceLineId, "P", 10,
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("800000"));
        lenient().when(slipRepository.saveAndFlush(any(SalesAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreateSalesAccountingSlipRequest req = requestWithSingleAllocation(
                sourceSlipId, sourceLineId, new BigDecimal("7"), new BigDecimal("100000"),
                new BigDecimal("700000"));

        assertThatCode(() -> service.createDraft(req, "actor-1")).doesNotThrowAnyException();
    }

    @Test
    void createDraft_empty_allocations_거부() {
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-3");

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("1"), new BigDecimal("100000"), List.of())));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_LINE_AMOUNT_MISMATCH));
    }

    @Test
    void createDraft_slipNo_충돌_retry_성공() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        LocalDate slipDate = LocalDate.of(2026, 5, 19);
        when(numberGenerator.next(slipDate)).thenReturn("SAS-DUP", "SAS-RETRY");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-R", sourceLineId, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        doThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint \"sales_accounting_slips_slip_no_key\""))
                .doAnswer((InvocationOnMock inv) -> inv.getArgument(0))
                .when(slipRepository).saveAndFlush(any(SalesAccountingSlip.class));

        SalesAccountingSlipResponse resp = service.createDraft(
                requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                        new BigDecimal("100000"), new BigDecimal("100000")),
                "actor-1");

        assertThat(resp.slipNo()).isEqualTo("SAS-RETRY");
        verify(numberGenerator, times(2)).next(slipDate);
        verify(slipRepository, times(2)).saveAndFlush(any(SalesAccountingSlip.class));
    }

    @Test
    void createDraftAttempt_REQUIRES_NEW_트랜잭션_검증() throws NoSuchMethodException {
        Method method = SalesAccountingSlipCreateAttemptService.class.getMethod(
                "createDraftAttempt", CreateSalesAccountingSlipRequest.class, String.class);
        Transactional transactional = method.getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    }

    @Test
    void verifySourceAndAllocation_advisory_lock_호출_검증() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        long expectedLockKey = sourceLineId.getMostSignificantBits() ^ sourceLineId.getLeastSignificantBits();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-4");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-L", sourceLineId, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(SalesAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        service.createDraft(requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                new BigDecimal("100000"), new BigDecimal("100000")), "actor-1");

        verify(entityManager).createNativeQuery("SELECT pg_advisory_xact_lock(:k)");
        verify(advisoryQuery).setParameter("k", expectedLockKey);
        verify(advisoryQuery).getSingleResult();
    }

    @Test
    void recalcTotals_allocation_정확일치_PASS() {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft("SAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(slip, 1, "P", "P",
                BigDecimal.ONE, new BigDecimal("100000.00"),
                new BigDecimal("90909.09"), new BigDecimal("9090.91"), new BigDecimal("100000.00"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-X", UUID.randomUUID(), 1,
                BigDecimal.ONE, new BigDecimal("100000.00")));
        slip.getLines().add(line);

        assertThatCode(slip::recalcTotals).doesNotThrowAnyException();
    }

    @Test
    void recalcTotals_allocation합계와_lineTotal_0_01원_차이면_SAS_LINE_AMOUNT_MISMATCH() {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft("SAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(slip, 1, "P", "P",
                BigDecimal.ONE, new BigDecimal("100000.00"),
                new BigDecimal("90909.09"), new BigDecimal("9090.91"), new BigDecimal("100000.00"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-X", UUID.randomUUID(), 1,
                BigDecimal.ONE, new BigDecimal("99999.99")));
        slip.getLines().add(line);

        assertThatThrownBy(slip::recalcTotals)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라인 합계")
                .hasMessageNotContaining("line_total")
                .hasMessageNotContaining("allocation")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_LINE_AMOUNT_MISMATCH));
    }

    @Test
    void source_slip_not_confirmed_SAS_SOURCE_SLIP_NOT_CONFIRMED() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, "P", 10,
                new BigDecimal("100000"), new BigDecimal("1000000"), "DRAFT", "OUTBOUND"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("1"), new BigDecimal("100000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "OUT-X", sourceLineId, 1,
                                new BigDecimal("1"), new BigDecimal("100000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("확정")
                .hasMessageContaining("전표=")
                .hasMessageNotContaining("CONFIRMED")
                .hasMessageNotContaining("slip=");
    }

    @Test
    void createDraft_INBOUND_source_거부_SAS_SOURCE_SLIP_TYPE_MISMATCH() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "IN-...", sourceLineId, "P", 10,
                new BigDecimal("100000"), new BigDecimal("1000000"), "CONFIRMED", "INBOUND"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("1"), new BigDecimal("100000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-X", sourceLineId, 1,
                                new BigDecimal("1"), new BigDecimal("100000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("출고")
                .hasMessageNotContaining("OUTBOUND")
                .hasMessageNotContaining("source")
                .hasMessageNotContaining("type")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH));
    }

    @Test
    void post_DRAFT_to_POSTED_정상() {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft("SAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        when(slipRepository.findBySlipNo("SAS-X")).thenReturn(Optional.of(slip));

        service.post("SAS-X", "actor-1");

        assertThat(slip.getStatus()).isEqualTo(SalesSlipStatus.POSTED);
        assertThat(slip.getPostedBy()).isEqualTo("actor-1");
    }

    private static CreateSalesAccountingSlipRequest requestWithSingleAllocation(
            UUID sourceSlipId, UUID sourceLineId, BigDecimal qty, BigDecimal unitPrice,
            BigDecimal allocatedAmount) {
        return new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "P", "P", qty, unitPrice,
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-X", sourceLineId, 1,
                                qty, allocatedAmount))
                )));
    }

    private static SalesAccountingSlip postedSlip(String slipNo, LocalDate slipDate,
            String partnerCode, String partnerName, BigDecimal supply, BigDecimal vat) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, slipDate, UUID.randomUUID(), partnerCode, partnerName,
                SalesTaxType.TAXABLE, "list test");
        BigDecimal total = supply.add(vat);
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(slip, 1,
                "SKU-1", "상품A", BigDecimal.ONE, supply, supply, vat, total);
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-" + slipNo, UUID.randomUUID(), 1,
                BigDecimal.ONE, total));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("actor-1");
        return slip;
    }
}
