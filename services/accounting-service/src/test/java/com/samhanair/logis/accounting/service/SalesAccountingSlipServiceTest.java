package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SalesAccountingSlipServiceTest {

    @Mock SalesAccountingSlipRepository slipRepository;
    @Mock SalesAccountingSlipAllocationRepository allocationRepository;
    @Mock SlipServiceClient slipServiceClient;
    @Mock SalesAccountingSlipNumberGenerator numberGenerator;
    @InjectMocks SalesAccountingSlipService service;

    @Test
    void createDraft_1대1_정상생성_VAT자동분리() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-2026-05-0001");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, "RX다배관",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.save(any(SalesAccountingSlip.class)))
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

        assertThat(resp.slipNo()).isEqualTo("SAS-2026-05-0001");
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
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED"));
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
                .hasMessageContaining("잔여를 초과");
    }

    @Test
    void source_slip_not_confirmed_SAS_SOURCE_SLIP_NOT_CONFIRMED() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, "P", 10,
                new BigDecimal("100000"), new BigDecimal("1000000"), "DRAFT"));

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
                .hasMessageContaining("CONFIRMED");
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
}
