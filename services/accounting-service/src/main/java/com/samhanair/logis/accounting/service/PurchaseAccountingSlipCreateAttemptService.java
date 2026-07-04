package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest.AllocationRequest;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest.LineRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
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
public class PurchaseAccountingSlipCreateAttemptService {

    private final PurchaseAccountingSlipRepository slipRepository;
    private final PurchaseAccountingSlipAllocationRepository allocationRepository;
    private final SlipServiceClient slipServiceClient;
    private final PurchaseAccountingSlipNumberGenerator numberGenerator;
    private final EntityManager entityManager;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PurchaseAccountingSlipResponse createDraftAttempt(
            CreatePurchaseAccountingSlipRequest req,
            String actorUserId) {
        String slipNo = numberGenerator.next(req.slipDate());
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, req.slipDate(), req.partnerId(), req.partnerCode(),
                req.partnerName(), req.taxType(), req.memo());

        int lineNo = 0;
        for (LineRequest lr : req.lines()) {
            if (lr.allocations() == null || lr.allocations().isEmpty()) {
                throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                        "매입전표 line allocation 이 비어 있습니다");
            }
            lineNo++;
            VatCalculator.Result vat = VatCalculator.split(lr.qty(), lr.unitPrice(), req.taxType());
            PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(
                    slip, lineNo, lr.productCode(), lr.productName(),
                    lr.qty(), lr.unitPrice(),
                    vat.supplyAmount(), vat.vatAmount(), vat.lineTotal());
            slip.getLines().add(line);

            for (AllocationRequest ar : lr.allocations()) {
                verifySourceAndAllocation(ar);
                line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                        ar.sourceSlipId(), ar.sourceSlipNo(),
                        ar.sourceLineId(), ar.sourceLineNo(),
                        ar.allocatedQty(), ar.allocatedAmount()));
            }
        }

        slip.recalcTotals();
        slipRepository.saveAndFlush(slip);
        return PurchaseAccountingSlipResponse.of(slip);
    }

    private void verifySourceAndAllocation(AllocationRequest ar) {
        acquireSourceLineLock(ar.sourceLineId());
        SlipLineSnapshot src = slipServiceClient.getSlipLine(ar.sourceLineId());
        if (!"INBOUND".equals(src.slipType())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH,
                    "매입전표는 입고전표만 source 가능 (slip="
                            + src.slipNo() + " type=" + slipTypeDisplayName(src.slipType()) + ")");
        }
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "(slip=" + src.slipNo() + " 상태=" + slipStatusDisplayName(src.slipStatus()) + ", 확정 요구)");
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

    private static String slipTypeDisplayName(String slipType) {
        if (slipType == null) {
            return null;
        }
        return switch (slipType) {
            case "OUTBOUND" -> "출고";
            case "INBOUND" -> "입고";
            default -> slipType;
        };
    }

    private static String slipStatusDisplayName(String slipStatus) {
        if (slipStatus == null) {
            return null;
        }
        return switch (slipStatus) {
            case "DRAFT" -> "임시저장";
            case "SAVED" -> "저장";
            case "CONFIRMED" -> "확정";
            case "LOCKED" -> "잠금";
            case "CANCELED" -> "취소";
            default -> slipStatus;
        };
    }

}
