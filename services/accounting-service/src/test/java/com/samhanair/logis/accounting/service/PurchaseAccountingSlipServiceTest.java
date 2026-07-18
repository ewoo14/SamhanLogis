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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
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
import org.mockito.ArgumentCaptor;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@ExtendWith(MockitoExtension.class)
class PurchaseAccountingSlipServiceTest {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Mock PurchaseAccountingSlipRepository slipRepository;
    @Mock PurchaseAccountingSlipAllocationRepository allocationRepository;
    @Mock SlipServiceClient slipServiceClient;
    @Mock PurchaseAccountingSlipNumberGenerator numberGenerator;
    @Mock EntityManager entityManager;
    @Mock Query advisoryQuery;
    PurchaseAccountingSlipCreateAttemptService createAttemptService;
    PurchaseAccountingSlipService service;

    @BeforeEach
    void setUp() {
        lenient().when(entityManager.createNativeQuery(anyString())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.setParameter(anyString(), any())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.getSingleResult()).thenReturn(1);
        createAttemptService = new PurchaseAccountingSlipCreateAttemptService(
                slipRepository,
                allocationRepository,
                slipServiceClient,
                numberGenerator,
                entityManager);
        service = new PurchaseAccountingSlipService(slipRepository, createAttemptService);
    }

    @Test
    void list_필터_조회_응답매핑() {
        LocalDate from = LocalDate.of(2026, 5, 1);
        LocalDate to = LocalDate.of(2026, 5, 31);
        PurchaseAccountingSlip slip = postedSlip("PAS-LIST-1", LocalDate.of(2026, 5, 20),
                "V-001", "매입거래처", new BigDecimal("200000.00"), new BigDecimal("20000.00"));
        when(slipRepository.findByFilters(from, to, "V-001", PurchaseSlipStatus.POSTED))
                .thenReturn(List.of(slip));

        List<PurchaseAccountingSlipResponse> responses =
                service.list(from, to, "V-001", PurchaseSlipStatus.POSTED);

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).slipNo()).isEqualTo("PAS-LIST-1");
        assertThat(responses.get(0).partnerCode()).isEqualTo("V-001");
        assertThat(responses.get(0).status()).isEqualTo("POSTED");
        assertThat(responses.get(0).lines()).hasSize(1);
        assertThat(responses.get(0).lines().get(0).allocations()).hasSize(1);
        verify(slipRepository).findByFilters(from, to, "V-001", PurchaseSlipStatus.POSTED);
    }

    @Test
    void createDraft_1대1_정상생성_VAT자동분리() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-1");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0042", sourceLineId, PARTNER_ID, "RX다배관",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "테스트",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000")))
                )));

        PurchaseAccountingSlipResponse resp = service.createDraft(req, "actor-1");

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
                UUID.randomUUID(), "IN-...", sourceLineId, PARTNER_ID, "P", 10,
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("800000"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("5"), new BigDecimal("160000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-X", sourceLineId, 1,
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
                sourceSlipId, "IN-B", sourceLineId, PARTNER_ID, "P", 10,
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("800000"));
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreatePurchaseAccountingSlipRequest req = requestWithSingleAllocation(
                sourceSlipId, sourceLineId, new BigDecimal("7"), new BigDecimal("100000"),
                new BigDecimal("700000"));

        assertThatCode(() -> service.createDraft(req, "actor-1")).doesNotThrowAnyException();
    }

    @Test
    void createDraft_empty_allocations_거부() {
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-3");

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
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
        when(numberGenerator.next(slipDate)).thenReturn("PAS-DUP", "PAS-RETRY");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-R", sourceLineId, PARTNER_ID, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        doThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint \"purchase_accounting_slips_slip_no_key\""))
                .doAnswer((InvocationOnMock inv) -> inv.getArgument(0))
                .when(slipRepository).saveAndFlush(any(PurchaseAccountingSlip.class));

        PurchaseAccountingSlipResponse resp = service.createDraft(
                requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                        new BigDecimal("100000"), new BigDecimal("100000")),
                "actor-1");

        assertThat(resp.slipNo()).isEqualTo("PAS-RETRY");
        verify(numberGenerator, times(2)).next(slipDate);
        verify(slipRepository, times(2)).saveAndFlush(any(PurchaseAccountingSlip.class));
    }

    @Test
    void createDraftAttempt_REQUIRES_NEW_트랜잭션_검증() throws NoSuchMethodException {
        Method method = PurchaseAccountingSlipCreateAttemptService.class.getMethod(
                "createDraftAttempt", CreatePurchaseAccountingSlipRequest.class, String.class);
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
                sourceSlipId, "IN-L", sourceLineId, PARTNER_ID, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        service.createDraft(requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                new BigDecimal("100000"), new BigDecimal("100000")), "actor-1");

        verify(entityManager).createNativeQuery("SELECT pg_advisory_xact_lock(:k)");
        verify(advisoryQuery).setParameter("k", expectedLockKey);
        verify(advisoryQuery).getSingleResult();
    }

    @Test
    void recalcTotals_allocation_정확일치_PASS() {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft("PAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(slip, 1, "P", "P",
                BigDecimal.ONE, new BigDecimal("100000.00"),
                new BigDecimal("90909.09"), new BigDecimal("9090.91"), new BigDecimal("100000.00"));
        line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "IN-X", UUID.randomUUID(), 1,
                BigDecimal.ONE, new BigDecimal("100000.00")));
        slip.getLines().add(line);

        assertThatCode(slip::recalcTotals).doesNotThrowAnyException();
    }

    @Test
    void recalcTotals_allocation합계와_lineTotal_0_01원_차이면_SAS_LINE_AMOUNT_MISMATCH() {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft("PAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(slip, 1, "P", "P",
                BigDecimal.ONE, new BigDecimal("100000.00"),
                new BigDecimal("90909.09"), new BigDecimal("9090.91"), new BigDecimal("100000.00"));
        line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "IN-X", UUID.randomUUID(), 1,
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
                UUID.randomUUID(), "IN-...", sourceLineId, PARTNER_ID, "P", 10,
                new BigDecimal("100000"), new BigDecimal("1000000"), "DRAFT", "INBOUND"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("1"), new BigDecimal("100000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-X", sourceLineId, 1,
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
    void createDraft_OUTBOUND_source_거부_SAS_SOURCE_SLIP_TYPE_MISMATCH() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, PARTNER_ID, "P", 10,
                new BigDecimal("100000"), new BigDecimal("1000000"), "CONFIRMED", "OUTBOUND"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("1"), new BigDecimal("100000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "OUT-X", sourceLineId, 1,
                                new BigDecimal("1"), new BigDecimal("100000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("입고")
                .hasMessageNotContaining("INBOUND")
                .hasMessageNotContaining("source")
                .hasMessageNotContaining("type")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH));
    }

    @Test
    void source_partner_불일치_SAS_SOURCE_PARTNER_MISMATCH() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        UUID sourcePartnerId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("PAS-PARTNER-MISMATCH");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-A", sourceLineId, sourcePartnerId, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        assertThatThrownBy(() -> service.createDraft(
                requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                        new BigDecimal("100000"), new BigDecimal("100000")), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("IN-PARTNER-A")
                .hasMessageNotContaining(sourceSlipId.toString())
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_PARTNER_MISMATCH));
    }

    @Test
    void source_partner_null_SAS_SOURCE_PARTNER_MISSING() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("PAS-PARTNER-MISSING");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-NULL", sourceLineId, null, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        assertThatThrownBy(() -> service.createDraft(
                requestWithSingleAllocation(sourceSlipId, sourceLineId, BigDecimal.ONE,
                        new BigDecimal("100000"), new BigDecimal("100000")), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("IN-PARTNER-NULL")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_PARTNER_MISSING));
    }

    @Test
    void header_partner_null은_원천조회와_채번보다_먼저_INVALID_INPUT() {
        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), null, "P-X", "X", SalesTaxType.TAXABLE, null, List.of());

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        verifyNoInteractions(numberGenerator, slipServiceClient);
    }

    @Test
    void source_identity는_payload가_달라도_snapshot의_slipId와_slipNo를_저장한다() {
        UUID snapshotSlipId = UUID.randomUUID();
        UUID payloadSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("PAS-SNAPSHOT-IDENTITY");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                snapshotSlipId, "IN-SNAPSHOT-A", sourceLineId, PARTNER_ID, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        service.createDraft(requestWithSingleAllocation(payloadSlipId, sourceLineId, BigDecimal.ONE,
                new BigDecimal("100000"), new BigDecimal("100000")), "actor-1");

        ArgumentCaptor<PurchaseAccountingSlip> captor = ArgumentCaptor.forClass(PurchaseAccountingSlip.class);
        verify(slipRepository).saveAndFlush(captor.capture());
        PurchaseAccountingSlipAllocation allocation = captor.getValue().getLines().get(0).getAllocations().get(0);
        assertThat(allocation.getSourceSlipId()).isEqualTo(snapshotSlipId);
        assertThat(allocation.getSourceSlipNo()).isEqualTo("IN-SNAPSHOT-A");
    }

    @Test
    void multipleSources_전원_거래처일치면_통과한다() {
        UUID firstSlipId = UUID.randomUUID();
        UUID firstLineId = UUID.randomUUID();
        UUID secondSlipId = UUID.randomUUID();
        UUID secondLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("PAS-MULTI-MATCH");
        when(slipServiceClient.getSlipLine(firstLineId)).thenReturn(new SlipLineSnapshot(
                firstSlipId, "IN-MULTI-A", firstLineId, PARTNER_ID, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(slipServiceClient.getSlipLine(secondLineId)).thenReturn(new SlipLineSnapshot(
                secondSlipId, "IN-MULTI-B", secondLineId, PARTNER_ID, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(firstLineId)).thenReturn(BigDecimal.ZERO);
        when(allocationRepository.sumAllocatedAmountBySourceLineId(secondLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("100000"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                firstSlipId, "IN-PAYLOAD-A", firstLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                secondSlipId, "IN-PAYLOAD-B", secondLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000"))))));

        assertThatCode(() -> service.createDraft(req, "actor-1")).doesNotThrowAnyException();
        verify(slipServiceClient).getSlipLine(firstLineId);
        verify(slipServiceClient).getSlipLine(secondLineId);
    }

    @Test
    void post_DRAFT_to_POSTED_정상() {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft("PAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        when(slipRepository.findBySlipNo("PAS-X")).thenReturn(Optional.of(slip));

        service.post("PAS-X", "actor-1");

        assertThat(slip.getStatus()).isEqualTo(PurchaseSlipStatus.POSTED);
        assertThat(slip.getPostedBy()).isEqualTo("actor-1");
    }

    private static CreatePurchaseAccountingSlipRequest requestWithSingleAllocation(
            UUID sourceSlipId, UUID sourceLineId, BigDecimal qty, BigDecimal unitPrice,
            BigDecimal allocatedAmount) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", qty, unitPrice,
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-X", sourceLineId, 1,
                                qty, allocatedAmount))
                )));
    }

    private static PurchaseAccountingSlip postedSlip(String slipNo, LocalDate slipDate,
            String partnerCode, String partnerName, BigDecimal supply, BigDecimal vat) {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, slipDate, UUID.randomUUID(), partnerCode, partnerName,
                SalesTaxType.TAXABLE, "list test");
        BigDecimal total = supply.add(vat);
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(slip, 1,
                "SKU-1", "상품A", BigDecimal.ONE, supply, supply, vat, total);
        line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "IN-" + slipNo, UUID.randomUUID(), 1,
                BigDecimal.ONE, total));
        slip.getLines().add(line);
        slip.recalcTotals();
        slip.post("actor-1");
        return slip;
    }
}
