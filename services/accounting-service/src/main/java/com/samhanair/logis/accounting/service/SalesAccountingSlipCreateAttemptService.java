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
                        "매출전표 라인 배분이 비어 있습니다");
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
                    "매출전표는 출고전표만 원천으로 사용할 수 있습니다 (전표="
                            + src.slipNo() + ", 유형=" + slipTypeDisplayName(src.slipType()) + ")");
        }
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "원천 전표가 확정 상태가 아닙니다 (전표="
                            + src.slipNo() + ", 상태=" + slipStatusDisplayName(src.slipStatus()) + ")");
        }
        BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineId(ar.sourceLineId());
        BigDecimal next = already.add(ar.allocatedAmount());
        if (next.compareTo(src.lineTotal()) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "할당 금액이 원천 전표 잔여를 초과합니다 (전표=" + src.slipNo()
                            + ", 요청=" + ar.allocatedAmount()
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

    /**
     * slip-service {@code SlipStatus} SSOT
     * ({@code services/slip-service/.../domain/SlipStatus.java}) 12종 전수 매핑 — displayName
     * 값을 그대로 옮긴다(SSOT drift 방지). default 는 신규 상태 추가 시 원어 leak 을 막기 위한
     * 안전망이나, 12종을 모두 매핑했으므로 실제 도달은 어렵다.
     */
    private static String slipStatusDisplayName(String slipStatus) {
        if (slipStatus == null) {
            return null;
        }
        return switch (slipStatus) {
            case "DRAFT" -> "작성중";
            case "SAVED" -> "저장완료";
            case "SENT" -> "전송완료";
            case "ACCEPTED" -> "수락";
            case "PROCESSING" -> "처리중";
            case "INSPECTING" -> "검수중";
            case "COMPLETED" -> "처리완료";
            case "SHIPPING" -> "배송중";
            case "DELIVERED" -> "배송완료";
            case "CONFIRMED" -> "확정";
            case "REJECTED" -> "반려";
            case "CANCELED" -> "취소";
            default -> slipStatus;
        };
    }

}
