package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.AllocationRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.LineRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SalesAccountingSlipCreateAttemptService {

    private final SalesAccountingSlipRepository slipRepository;
    private final SalesAccountingSlipAllocationRepository allocationRepository;
    private final SlipServiceClient slipServiceClient;
    private final SalesAccountingSlipNumberGenerator numberGenerator;
    private final EntityManager entityManager;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SalesAccountingSlipResponse createDraftAttempt(
            CreateSalesAccountingSlipRequest req,
            String actorUserId) {
        String slipNo = numberGenerator.next(req.slipDate());
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, req.slipDate(), req.partnerId(), req.partnerCode(),
                req.partnerName(), req.taxType(), req.memo());

        int lineNo = 0;
        for (LineRequest lr : req.lines()) {
            if (lr.allocations() == null || lr.allocations().isEmpty()) {
                throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                        "매출전표 line allocation 이 비어 있습니다");
            }
            lineNo++;
            VatCalculator.Result vat = VatCalculator.split(lr.qty(), lr.unitPrice(), req.taxType());
            SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                    slip, lineNo, lr.productCode(), lr.productName(),
                    lr.qty(), lr.unitPrice(),
                    vat.supplyAmount(), vat.vatAmount(), vat.lineTotal());
            slip.getLines().add(line);

            for (AllocationRequest ar : lr.allocations()) {
                verifySourceAndAllocation(ar);
                line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                        ar.sourceSlipId(), ar.sourceSlipNo(),
                        ar.sourceLineId(), ar.sourceLineNo(),
                        ar.allocatedQty(), ar.allocatedAmount()));
            }
        }

        slip.recalcTotals();
        slipRepository.saveAndFlush(slip);
        return SalesAccountingSlipResponse.of(slip);
    }

    private void verifySourceAndAllocation(AllocationRequest ar) {
        acquireSourceLineLock(ar.sourceLineId());
        SlipLineSnapshot src = slipServiceClient.getSlipLine(ar.sourceLineId());
        if (!"OUTBOUND".equals(src.slipType())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH,
                    "매출전표는 OUTBOUND 출고전표만 source 가능 (slip="
                            + src.slipNo() + " type=" + src.slipType() + ")");
        }
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "(slip=" + src.slipNo() + " 상태=" + src.slipStatus() + ", CONFIRMED 요구)");
        }
        BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineId(ar.sourceLineId());
        BigDecimal next = already.add(ar.allocatedAmount());
        if (next.compareTo(src.lineTotal()) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "(slip=" + src.slipNo() + " 잔여를 초과: 요청=" + ar.allocatedAmount()
                            + ", 잔여=" + src.lineTotal().subtract(already) + ")");
        }
    }

    private void acquireSourceLineLock(UUID sourceLineId) {
        long lockKey = sourceLineId.getMostSignificantBits() ^ sourceLineId.getLeastSignificantBits();
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:k)")
                .setParameter("k", lockKey)
                .getSingleResult();
    }

}
