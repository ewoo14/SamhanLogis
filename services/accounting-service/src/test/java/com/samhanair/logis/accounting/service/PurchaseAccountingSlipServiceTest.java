package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
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
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
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
    @Mock DailyClosingVerificationService dailyClosingVerificationService;
    PurchaseAccountingSlipCreateAttemptService createAttemptService;
    PurchaseAccountingSlipService service;

    @BeforeEach
    void setUp() {
        lenient().when(entityManager.createNativeQuery(anyString())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.setParameter(anyString(), any())).thenReturn(advisoryQuery);
        lenient().when(advisoryQuery.getSingleResult()).thenReturn(1);
        lenient().when(allocationRepository.sumAllocatedQtyBySourceLineId(any()))
                .thenReturn(BigDecimal.ZERO);
        lenient().when(dailyClosingVerificationService.requireLockedClosing(any(), any(), any(), any()))
                .thenReturn(new DailyClosingVerificationService.VerificationResult(
                        DailyClosingVerificationService.Status.VERIFIED, ""));
        createAttemptService = new PurchaseAccountingSlipCreateAttemptService(
                slipRepository,
                allocationRepository,
                slipServiceClient,
                numberGenerator,
                entityManager,
                dailyClosingVerificationService);
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
                sourceSlipId, "IN-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관",
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
                UUID.randomUUID(), "IN-...", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
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
                sourceSlipId, "IN-B", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
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
                sourceSlipId, "IN-R", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
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
    void createDraft_retry_각_attempt가_원천_snapshot과_DB_합계를_재조회하고_변경된_baseline을_반영한다() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        LocalDate slipDate = LocalDate.of(2026, 5, 19);
        when(numberGenerator.next(slipDate)).thenReturn("PAS-CACHE-1", "PAS-CACHE-2");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-CACHE", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(BigDecimal.ZERO, new BigDecimal("50"));
        when(allocationRepository.sumAllocatedQtyBySourceLineId(sourceLineId))
                .thenReturn(BigDecimal.ZERO, new BigDecimal("5"));
        doThrow(new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"purchase_accounting_slips_slip_no_key\""))
                .when(slipRepository).saveAndFlush(any(PurchaseAccountingSlip.class));

        assertThatThrownBy(() -> service.createDraft(
                requestWithSingleAllocation(sourceSlipId, sourceLineId, new BigDecimal("6"),
                        new BigDecimal("10"), new BigDecimal("60")), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=50.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));

        verify(slipServiceClient, times(2)).getSlipLine(sourceLineId);
        verify(allocationRepository, times(2)).sumAllocatedAmountBySourceLineId(sourceLineId);
        verify(allocationRepository, times(2)).sumAllocatedQtyBySourceLineId(sourceLineId);
        verify(slipRepository, times(1)).saveAndFlush(any(PurchaseAccountingSlip.class));
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
                sourceSlipId, "IN-L", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
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
    void 요청_내부_A_A_금액누적_과할당은_SAS_OVER_ALLOCATION_잔여금액을_반환한다() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "IN-A-A", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(BigDecimal.ZERO);

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("10"), new BigDecimal("10"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-A-A", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("60")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-A-A", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("60"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=40.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
        verify(slipRepository, times(0)).saveAndFlush(any(PurchaseAccountingSlip.class));
        verify(slipServiceClient, times(1)).getSlipLine(sourceLineId);
        verify(allocationRepository, times(1)).sumAllocatedAmountBySourceLineId(sourceLineId);
        verify(allocationRepository, times(1)).sumAllocatedQtyBySourceLineId(sourceLineId);
    }

    @Test
    void DB_기존금액50과_요청내25_25는_합계100_경계라_통과한다() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("PAS-DB-BND");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-DB-BND", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("50"));
        when(allocationRepository.sumAllocatedQtyBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("5"));
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        assertThatCode(() -> service.createDraft(
                requestWithTwoAllocations(sourceSlipId, sourceLineId,
                        new BigDecimal("25"), new BigDecimal("2.5")), "actor-1"))
                .doesNotThrowAnyException();
    }

    @Test
    void DB_기존금액50과_요청내30_30은_합계110이라_거부한다() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-DB-OVER", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                new BigDecimal("10"), new BigDecimal("100"), "CONFIRMED", "INBOUND"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("50"));
        when(allocationRepository.sumAllocatedQtyBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("5"));

        assertThatThrownBy(() -> service.createDraft(
                requestWithTwoAllocations(sourceSlipId, sourceLineId,
                        new BigDecimal("30"), new BigDecimal("3")), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=20.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
        verify(slipRepository, times(0)).saveAndFlush(any(PurchaseAccountingSlip.class));
    }

    @Test
    void firstAllocation_시딩_후_수량누적_과할당도_금액통과_후_차단한다() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(sourceSnapshot(
                sourceLineId, "IN-QTY", new BigDecimal("2"), new BigDecimal("20")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(BigDecimal.ZERO);

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("10"), new BigDecimal("2"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-QTY", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("10")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-QTY", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("10"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여수량=4.000")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
    }

    @Test
    void 서비스_직접호출_sourceLineId_null은_외부조회_전에_INVALID_INPUT() {
        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", BigDecimal.ONE, new BigDecimal("100"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-X", null, 1,
                                BigDecimal.ONE, new BigDecimal("100"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        verifyNoInteractions(entityManager, slipServiceClient, allocationRepository,
                slipRepository, numberGenerator);
    }

    @Test
    void advisory_lock은_payload_순서가_아닌_lockKey_숫자순으로_선잠금한다() {
        UUID highKeyLineId = new UUID(0L, 2L);
        UUID lowKeyLineId = new UUID(0L, 1L);
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-LOCK");
        when(slipServiceClient.getSlipLine(highKeyLineId)).thenReturn(sourceSnapshot(
                highKeyLineId, "IN-HIGH", new BigDecimal("10"), new BigDecimal("10")));
        when(slipServiceClient.getSlipLine(lowKeyLineId)).thenReturn(sourceSnapshot(
                lowKeyLineId, "IN-LOW", new BigDecimal("10"), new BigDecimal("10")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(any())).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("10"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-HIGH", highKeyLineId, 1,
                                BigDecimal.ONE, new BigDecimal("10")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-LOW", lowKeyLineId, 1,
                                BigDecimal.ONE, new BigDecimal("10"))))));

        service.createDraft(req, "actor-1");

        InOrder order = inOrder(advisoryQuery);
        order.verify(advisoryQuery).setParameter("k", 1L);
        order.verify(advisoryQuery).getSingleResult();
        order.verify(advisoryQuery).setParameter("k", 2L);
        order.verify(advisoryQuery).getSingleResult();
    }

    private SlipLineSnapshot sourceSnapshot(UUID lineId, String slipNo,
            BigDecimal unitPrice, BigDecimal lineTotal) {
        return new SlipLineSnapshot(UUID.randomUUID(), slipNo, lineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
                unitPrice, lineTotal, "CONFIRMED", "INBOUND");
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
                UUID.randomUUID(), "IN-...", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
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
                UUID.randomUUID(), "OUT-...", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 10,
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
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-A", sourceLineId, sourcePartnerId,
                "P-PARTNER-A", "거래처 A", "P", 1,
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
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-NULL", sourceLineId, null,
                "P-MISSING", "거래처 미상", "P", 1,
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
    void source_partnerId_exists_code_name_null은_SAS_SOURCE_PARTNER_MISSING() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-NULL-DISPLAY", sourceLineId, PARTNER_ID,
                null, null, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        assertThatThrownBy(() -> service.createDraft(requestWithSingleAllocation(sourceSlipId, sourceLineId,
                BigDecimal.ONE, new BigDecimal("100000"), new BigDecimal("100000")), "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_PARTNER_MISSING));
        verifyNoInteractions(slipRepository);
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
                snapshotSlipId, "IN-SNAPSHOT-A", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
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
                firstSlipId, "IN-MULTI-A", firstLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(slipServiceClient.getSlipLine(secondLineId)).thenReturn(new SlipLineSnapshot(
                secondSlipId, "IN-MULTI-B", secondLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
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

    private static CreatePurchaseAccountingSlipRequest requestWithTwoAllocations(
            UUID sourceSlipId, UUID sourceLineId, BigDecimal eachAmount, BigDecimal eachQty) {
        BigDecimal totalAmount = eachAmount.multiply(new BigDecimal("2"));
        BigDecimal totalQty = eachQty.multiply(new BigDecimal("2"));
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", totalQty, totalAmount.divide(totalQty, 2, java.math.RoundingMode.HALF_UP),
                        List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        sourceSlipId, "IN-X", sourceLineId, 1, eachQty, eachAmount),
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        sourceSlipId, "IN-X", sourceLineId, 1, eachQty, eachAmount))
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

    // ===== #850 R1 적대검증 보강 — 프로덕션 코드 무변경, 테스트만 추가 (매입 대칭) =====

    /**
     * HIGH-2 입력 계약 — Bean Validation 을 우회하는 서비스 직접호출에서도 애플리케이션 선검증(D-850-01)이
     * primary 임을 증명한다. 음수·0·null·scale 초과·{@code @Digits} overflow·라인/배분 원소 null 모두
     * 락·외부조회(SlipService)·채번·Repository 접촉 前에 {@link ErrorCode#INVALID_INPUT} 로 거부되어야 한다.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidInputRequests")
    void 서비스_직접호출_입력계약위반은_락_외부조회_채번_前에_INVALID_INPUT(
            String label, CreatePurchaseAccountingSlipRequest req) {
        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        verifyNoInteractions(entityManager, slipServiceClient, allocationRepository,
                slipRepository, numberGenerator);
    }

    static Stream<Arguments> invalidInputRequests() {
        return Stream.of(
                Arguments.of("금액_음수", reqWithAllocation(BigDecimal.ONE, new BigDecimal("-100"))),
                Arguments.of("금액_0", reqWithAllocation(BigDecimal.ONE, BigDecimal.ZERO)),
                Arguments.of("금액_null", reqWithAllocation(BigDecimal.ONE, null)),
                Arguments.of("수량_음수", reqWithAllocation(new BigDecimal("-1"), new BigDecimal("100"))),
                Arguments.of("수량_0", reqWithAllocation(BigDecimal.ZERO, new BigDecimal("100"))),
                Arguments.of("수량_null", reqWithAllocation(null, new BigDecimal("100"))),
                Arguments.of("금액_소수3자리_scale초과", reqWithAllocation(BigDecimal.ONE, new BigDecimal("1.001"))),
                Arguments.of("수량_소수4자리_scale초과", reqWithAllocation(new BigDecimal("1.0001"), new BigDecimal("100"))),
                Arguments.of("금액_정수14자리_Digits초과",
                        reqWithAllocation(BigDecimal.ONE, new BigDecimal("10000000000000"))),
                Arguments.of("수량_정수10자리_Digits초과",
                        reqWithAllocation(new BigDecimal("1000000000"), new BigDecimal("100"))),
                Arguments.of("lines_원소_null", new CreatePurchaseAccountingSlipRequest(
                        LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                        Arrays.asList((CreatePurchaseAccountingSlipRequest.LineRequest) null))),
                Arguments.of("allocations_원소_null", new CreatePurchaseAccountingSlipRequest(
                        LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                        List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                                "P", "P", new BigDecimal("1"), new BigDecimal("100"),
                                Arrays.asList((CreatePurchaseAccountingSlipRequest.AllocationRequest) null))))));
    }

    private static CreatePurchaseAccountingSlipRequest reqWithAllocation(BigDecimal allocQty, BigDecimal allocAmount) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("1"), new BigDecimal("100"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-X", UUID.randomUUID(), 1, allocQty, allocAmount)))));
    }

    /**
     * MED-1 경계 — 동일 원천 한 요청 내 {@code 50+50=100}(=잔여)·{@code 5+5=10}(=수량 잔여)는
     * off-by-one 없이 정확 경계라 통과해야 한다({@code >} 비교, {@code >=} 회귀 방지).
     */
    @Test
    void 요청내_동일원천_금액50_50_수량5_5는_잔여_정확경계라_통과한다() {
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-BND");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(sourceSnapshot(
                sourceLineId, "IN-BND", new BigDecimal("10"), new BigDecimal("100")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("10"), new BigDecimal("10"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-BND", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("50")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-BND", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("50"))))));

        assertThatCode(() -> service.createDraft(req, "actor-1")).doesNotThrowAnyException();
        verify(slipRepository, times(1)).saveAndFlush(any(PurchaseAccountingSlip.class));
    }

    /**
     * MED-2 라인 간 누적 — 서로 다른 LineRequest 가 같은 원천 A 에 배분하면 요청 내 누적이 라인을 가로질러
     * 합산되어야 한다({@code 60+60>100}). 원천은 1회만 캐시 조회된다(D-850-06).
     */
    @Test
    void 라인간_동일원천_A_A_누적초과는_reject하고_원천은_1회만_조회한다() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(sourceSnapshot(
                sourceLineId, "IN-LL", new BigDecimal("10"), new BigDecimal("100")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(
                        new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                                new BigDecimal("6"), new BigDecimal("10"), List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        UUID.randomUUID(), "IN-LL", sourceLineId, 1,
                                        new BigDecimal("6"), new BigDecimal("60")))),
                        new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                                new BigDecimal("6"), new BigDecimal("10"), List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        UUID.randomUUID(), "IN-LL", sourceLineId, 1,
                                        new BigDecimal("6"), new BigDecimal("60"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=40.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
        verify(slipRepository, times(0)).saveAndFlush(any(PurchaseAccountingSlip.class));
        verify(slipServiceClient, times(1)).getSlipLine(sourceLineId);
        verify(allocationRepository, times(1)).sumAllocatedAmountBySourceLineId(sourceLineId);
    }

    /**
     * MED-2 교차 {@code A+B+A} — firstAllocation(A)의 금액·수량 시딩(D-850-03)이 크로스라인으로 반영되어
     * 세 번째 라인의 두 번째 A 에서 누적 초과로 거부되어야 한다. 시딩이 없으면 두 번째 A 가 잔여를 100 으로
     * 오인해 통과하는 회귀를 잡는다.
     */
    @Test
    void 교차_A_B_A_는_firstAllocation_시딩을_크로스라인_반영해_두번째_A에서_reject한다() {
        UUID srcA = UUID.randomUUID();
        UUID srcB = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(srcA)).thenReturn(sourceSnapshot(
                srcA, "IN-A", new BigDecimal("10"), new BigDecimal("100")));
        when(slipServiceClient.getSlipLine(srcB)).thenReturn(sourceSnapshot(
                srcB, "IN-B", new BigDecimal("10"), new BigDecimal("100")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(any())).thenReturn(BigDecimal.ZERO);

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(
                        new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                                new BigDecimal("6"), new BigDecimal("10"), List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        UUID.randomUUID(), "IN-A", srcA, 1,
                                        new BigDecimal("6"), new BigDecimal("60")))),
                        new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                                new BigDecimal("6"), new BigDecimal("10"), List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        UUID.randomUUID(), "IN-B", srcB, 1,
                                        new BigDecimal("6"), new BigDecimal("60")))),
                        new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                                new BigDecimal("6"), new BigDecimal("10"), List.of(
                                new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                        UUID.randomUUID(), "IN-A", srcA, 1,
                                        new BigDecimal("6"), new BigDecimal("60"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=40.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
        verify(slipRepository, times(0)).saveAndFlush(any(PurchaseAccountingSlip.class));
    }

    /** MED-2 동일 원천 3회 이상 배분 — 단계적 누적(40→80→초과)으로 세 번째에서 거부. */
    @Test
    void 요청내_동일원천_3회_배분_단계누적_초과는_reject한다() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(sourceSnapshot(
                sourceLineId, "IN-3X", new BigDecimal("10"), new BigDecimal("100")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                        new BigDecimal("12"), new BigDecimal("10"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-3X", sourceLineId, 1,
                                new BigDecimal("4"), new BigDecimal("40")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-3X", sourceLineId, 1,
                                new BigDecimal("4"), new BigDecimal("40")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-3X", sourceLineId, 1,
                                new BigDecimal("4"), new BigDecimal("40"))))));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여금액=20.00")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_OVER_ALLOCATION));
        verify(slipRepository, times(0)).saveAndFlush(any(PurchaseAccountingSlip.class));
    }

    /**
     * HIGH-1 lockKey dedup+정렬 — 서로 다른 UUID 이지만 {@code msb^lsb} 가 동일한 XOR 충돌쌍은 하나의
     * lockKey 로 1회만 선잠금하고(dedup), 제3 key 와 함께 lockKey 숫자순으로 정렬 선잠금한다(D-850-06).
     * dedup 에도 세 원천은 sourceLineId 별로 모두 로드된다. (실 경합은 PurchaseAccountingSlipConcurrencyIT)
     */
    @Test
    void XOR충돌_sourceLineId_2개는_lockKey_1회만_선잠금하고_세_원천을_모두_로드한다() {
        UUID collisionA = new UUID(0x1111111111111111L, 0x2222222222222222L);
        long k = 0x0100000000000001L;
        UUID collisionB = new UUID(collisionA.getMostSignificantBits() ^ k,
                collisionA.getLeastSignificantBits() ^ k);
        UUID other = new UUID(0L, 1L);
        long collisionKey = collisionA.getMostSignificantBits() ^ collisionA.getLeastSignificantBits();
        long otherKey = other.getMostSignificantBits() ^ other.getLeastSignificantBits();
        // 사전조건: 충돌쌍 lockKey 동일·UUID 상이, 제3 key 상이
        assertThat(collisionB.getMostSignificantBits() ^ collisionB.getLeastSignificantBits())
                .isEqualTo(collisionKey);
        assertThat(collisionA).isNotEqualTo(collisionB);
        assertThat(otherKey).isNotEqualTo(collisionKey);
        assertThat(otherKey).isLessThan(collisionKey);

        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-XOR");
        when(slipServiceClient.getSlipLine(collisionA)).thenReturn(sourceSnapshot(
                collisionA, "IN-XA", new BigDecimal("10"), new BigDecimal("10")));
        when(slipServiceClient.getSlipLine(collisionB)).thenReturn(sourceSnapshot(
                collisionB, "IN-XB", new BigDecimal("10"), new BigDecimal("10")));
        when(slipServiceClient.getSlipLine(other)).thenReturn(sourceSnapshot(
                other, "IN-XC", new BigDecimal("10"), new BigDecimal("10")));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(any())).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.saveAndFlush(any(PurchaseAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        // payload 순서 = [collisionA, other, collisionB] (lockKey 정렬 순서와 다름)
        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-X", "X", SalesTaxType.TAXABLE, null,
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest("P", "P",
                        new BigDecimal("3"), new BigDecimal("10"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-XA", collisionA, 1,
                                BigDecimal.ONE, new BigDecimal("10")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-XC", other, 1,
                                BigDecimal.ONE, new BigDecimal("10")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-XB", collisionB, 1,
                                BigDecimal.ONE, new BigDecimal("10"))))));

        service.createDraft(req, "actor-1");

        // 충돌쌍은 하나의 lockKey 로 1회만 선잠금(dedup), 제3 key 도 1회
        verify(advisoryQuery, times(1)).setParameter("k", collisionKey);
        verify(advisoryQuery, times(1)).setParameter("k", otherKey);
        // 정렬: otherKey(작음) 먼저, collisionKey 다음
        InOrder order = inOrder(advisoryQuery);
        order.verify(advisoryQuery).setParameter("k", otherKey);
        order.verify(advisoryQuery).setParameter("k", collisionKey);
        // dedup 에도 세 원천 모두 로드
        verify(slipServiceClient).getSlipLine(collisionA);
        verify(slipServiceClient).getSlipLine(collisionB);
        verify(slipServiceClient).getSlipLine(other);
    }
}
