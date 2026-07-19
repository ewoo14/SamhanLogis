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
        if (req.partnerId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "매입전표 대상 거래처는 필수입니다");
        }
        AllocationRequest firstAllocation = null;
        for (LineRequest lr : req.lines()) {
            if (lr.allocations() == null || lr.allocations().isEmpty()) {
                throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                        "매입전표 라인 배분이 비어 있습니다");
            }
            if (firstAllocation == null) {
                firstAllocation = lr.allocations().get(0);
            }
        }
        if (firstAllocation == null) {
            throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                    "매입전표 라인 배분이 비어 있습니다");
        }
        SlipLineSnapshot firstSource = verifySourceAndAllocation(firstAllocation, req.partnerId());
        String slipNo = numberGenerator.next(req.slipDate());
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, req.slipDate(), firstSource.partnerId(), firstSource.partnerCode(),
                firstSource.partnerName(), req.taxType(), req.memo());

        int lineNo = 0;
        boolean firstSourceConsumed = false;
        for (LineRequest lr : req.lines()) {
            lineNo++;
            VatCalculator.Result vat = VatCalculator.split(lr.qty(), lr.unitPrice(), req.taxType());
            PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(
                    slip, lineNo, lr.productCode(), lr.productName(),
                    lr.qty(), lr.unitPrice(),
                    vat.supplyAmount(), vat.vatAmount(), vat.lineTotal());
            slip.getLines().add(line);

            for (AllocationRequest ar : lr.allocations()) {
                SlipLineSnapshot src = !firstSourceConsumed && ar == firstAllocation
                        ? firstSource
                        : verifySourceAndAllocation(ar, req.partnerId());
                firstSourceConsumed = true;
                line.getAllocations().add(PurchaseAccountingSlipAllocation.create(line,
                        src.slipId(), src.slipNo(),
                        ar.sourceLineId(), ar.sourceLineNo(),
                        ar.allocatedQty(), ar.allocatedAmount()));
            }
        }

        slip.recalcTotals();
        slipRepository.saveAndFlush(slip);
        return PurchaseAccountingSlipResponse.of(slip);
    }

    private SlipLineSnapshot verifySourceAndAllocation(AllocationRequest ar, UUID headerPartnerId) {
        acquireSourceLineLock(ar.sourceLineId());
        SlipLineSnapshot src = slipServiceClient.getSlipLine(ar.sourceLineId());
        if (!"INBOUND".equals(src.slipType())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH,
                    "매입전표는 입고전표만 원천으로 사용할 수 있습니다 (전표="
                            + src.slipNo() + ", 유형=" + slipTypeDisplayName(src.slipType()) + ")");
        }
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "원천 전표가 확정 상태가 아닙니다 (전표="
                            + src.slipNo() + ", 상태=" + slipStatusDisplayName(src.slipStatus()) + ")");
        }
        if (src.partnerId() == null) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_PARTNER_MISSING,
                    "원천 전표에 거래처가 없습니다 (전표=" + src.slipNo() + ")");
        }
        if (!src.partnerId().equals(headerPartnerId)) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_PARTNER_MISMATCH,
                    "원천 전표 거래처가 대상 전표 거래처와 일치하지 않습니다 (전표="
                            + src.slipNo() + ")");
        }
        BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineId(ar.sourceLineId());
        BigDecimal next = already.add(ar.allocatedAmount());
        if (next.compareTo(src.lineTotal()) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "할당 금액이 원천 전표 잔여를 초과합니다 (전표=" + src.slipNo()
                            + ", 요청=" + ar.allocatedAmount()
                            + ", 잔여=" + src.lineTotal().subtract(already) + ")");
        }
        return src;
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
