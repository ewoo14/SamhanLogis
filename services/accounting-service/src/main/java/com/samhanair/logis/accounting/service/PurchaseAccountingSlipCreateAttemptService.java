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
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final DailyClosingVerificationService dailyClosingVerificationService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PurchaseAccountingSlipResponse createDraftAttempt(
            CreatePurchaseAccountingSlipRequest req,
            String actorUserId) {
        validateRequest(req);
        if (req.partnerId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "입고전표 대상 거래처는 필수입니다");
        }
        AllocationRequest firstAllocation = null;
        for (LineRequest lr : req.lines()) {
            if (lr.allocations() == null || lr.allocations().isEmpty()) {
                throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                        "입고전표 라인 배분이 비어 있습니다");
            }
            if (firstAllocation == null) {
                firstAllocation = lr.allocations().get(0);
            }
        }
        if (firstAllocation == null) {
            throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                    "입고전표 라인 배분이 비어 있습니다");
        }
        Map<UUID, AllocationTotals> allocationTotals = new HashMap<>();
        List<UUID> sourceLineIds = req.lines().stream()
                .flatMap(line -> line.allocations().stream())
                .map(AllocationRequest::sourceLineId)
                .distinct()
                .toList();
        sourceLineIds.stream()
                .map(PurchaseAccountingSlipCreateAttemptService::lockKey)
                .distinct()
                .sorted()
                .forEach(this::acquireSourceLineLock);

        Map<UUID, SourceState> sourceCache = new HashMap<>();
        for (UUID sourceLineId : sourceLineIds) {
            sourceCache.put(sourceLineId, loadSourceState(sourceLineId, req.partnerId()));
        }

        SourceState firstState = sourceCache.get(firstAllocation.sourceLineId());
        requireDailyClosing(firstState.snapshot(), req.slipDate());
        verifyAndAccumulate(firstAllocation, firstState, allocationTotals);
        String slipNo = numberGenerator.next(req.slipDate());
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, req.slipDate(), firstState.snapshot().partnerId(), firstState.snapshot().partnerCode(),
                firstState.snapshot().partnerName(), req.taxType(), req.memo());

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
                        ? firstState.snapshot()
                        : verifyAndAccumulate(ar, sourceCache.get(ar.sourceLineId()), allocationTotals);
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

    private void requireDailyClosing(SlipLineSnapshot source, java.time.LocalDate slipDate) {
        DailyClosingVerificationService.VerificationResult result =
                dailyClosingVerificationService.requireLockedClosing(
                        slipDate, com.samhanair.logis.accounting.domain.DailyClosingKind.PURCHASE,
                        com.samhanair.logis.accounting.domain.DailyClosingSourceKind.PURCHASE_SLIP,
                        source.partnerId());
        if (!result.allowed()) {
            throw new BusinessException(ErrorCode.CONFLICT, result.userMessage());
        }
    }

    private SourceState loadSourceState(UUID sourceLineId, UUID headerPartnerId) {
        SlipLineSnapshot src = slipServiceClient.getSlipLine(sourceLineId);
        if (!sourceLineId.equals(src.lineId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "원천 라인 식별자가 요청과 일치하지 않습니다 (요청=" + sourceLineId + ")");
        }
        if (!"INBOUND".equals(src.slipType())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_TYPE_MISMATCH,
                    "입고전표는 입고전표만 원천으로 사용할 수 있습니다 (전표="
                            + src.slipNo() + ", 유형=" + slipTypeDisplayName(src.slipType()) + ")");
        }
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "원천 전표가 확정 상태가 아닙니다 (전표="
                            + src.slipNo() + ", 상태=" + slipStatusDisplayName(src.slipStatus()) + ")");
        }
        if (src.partnerId() == null
                || src.partnerCode() == null || src.partnerCode().isBlank()
                || src.partnerName() == null || src.partnerName().isBlank()) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_PARTNER_MISSING,
                    "원천 전표에 거래처가 없습니다 (전표=" + src.slipNo() + ")");
        }
        if (!src.partnerId().equals(headerPartnerId)) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_PARTNER_MISMATCH,
                    "원천 전표 거래처가 대상 전표 거래처와 일치하지 않습니다 (전표="
                            + src.slipNo() + ")");
        }
        BigDecimal dbAmount = nonNull(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId));
        BigDecimal dbQty = nonNull(allocationRepository.sumAllocatedQtyBySourceLineId(sourceLineId));
        return new SourceState(src, dbAmount, dbQty);
    }

    private SlipLineSnapshot verifyAndAccumulate(AllocationRequest ar, SourceState state,
            Map<UUID, AllocationTotals> allocationTotals) {
        AllocationTotals current = allocationTotals.getOrDefault(ar.sourceLineId(),
                new AllocationTotals(BigDecimal.ZERO, BigDecimal.ZERO));
        BigDecimal availableAmount = state.snapshot().lineTotal()
                .subtract(state.dbAmount())
                .subtract(current.amount());
        if (ar.allocatedAmount().compareTo(availableAmount.max(BigDecimal.ZERO)) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "할당 금액이 원천 전표 잔여를 초과합니다 (전표=" + state.snapshot().slipNo()
                            + ", 요청=" + formatAmount(ar.allocatedAmount())
                            + ", 잔여금액=" + formatAmount(availableAmount) + ")");
        }
        BigDecimal availableQty = BigDecimal.valueOf(state.snapshot().quantity())
                .subtract(state.dbQty())
                .subtract(current.qty());
        if (ar.allocatedQty().compareTo(availableQty.max(BigDecimal.ZERO)) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "할당 수량이 원천 전표 잔여를 초과합니다 (전표=" + state.snapshot().slipNo()
                            + ", 요청=" + formatQuantity(ar.allocatedQty())
                            + ", 잔여수량=" + formatQuantity(availableQty) + ")");
        }
        allocationTotals.put(ar.sourceLineId(), new AllocationTotals(
                current.amount().add(ar.allocatedAmount()), current.qty().add(ar.allocatedQty())));
        return state.snapshot();
    }

    private void acquireSourceLineLock(long lockKey) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:k)")
                .setParameter("k", lockKey)
                .getSingleResult();
    }

    private static long lockKey(UUID sourceLineId) {
        return sourceLineId.getMostSignificantBits() ^ sourceLineId.getLeastSignificantBits();
    }

    private static void validateRequest(CreatePurchaseAccountingSlipRequest req) {
        if (req == null || req.lines() == null) {
            invalidInput("lines 는 필수입니다");
        }
        for (LineRequest line : req.lines()) {
            if (line == null) {
                invalidInput("lines 원소는 null일 수 없습니다");
            }
            if (line.allocations() == null) {
                invalidInput("allocations 는 필수입니다");
            }
            for (AllocationRequest allocation : line.allocations()) {
                if (allocation == null) {
                    invalidInput("allocations 원소는 null일 수 없습니다");
                }
                if (allocation.sourceLineId() == null) {
                    invalidInput("sourceLineId 는 필수입니다");
                }
                validatePositiveDigits("allocatedQty", allocation.allocatedQty(), 9, 3);
                validatePositiveDigits("allocatedAmount", allocation.allocatedAmount(), 13, 2);
            }
        }
    }

    private static void validatePositiveDigits(String field, BigDecimal value,
            int integerDigits, int fractionDigits) {
        if (value == null || value.signum() <= 0
                || value.scale() > fractionDigits
                || value.precision() - value.scale() > integerDigits) {
            invalidInput(field + " 는 양수이고 정수 " + integerDigits
                    + "자리, 소수 " + fractionDigits + "자리 이하여야 합니다");
        }
    }

    private static void invalidInput(String message) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, message);
    }

    private static BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String formatAmount(BigDecimal value) {
        return value.max(BigDecimal.ZERO).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }

    private static String formatQuantity(BigDecimal value) {
        return value.max(BigDecimal.ZERO).setScale(3, RoundingMode.UNNECESSARY).toPlainString();
    }

    private record SourceState(SlipLineSnapshot snapshot, BigDecimal dbAmount, BigDecimal dbQty) {}

    private record AllocationTotals(BigDecimal amount, BigDecimal qty) {}

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
