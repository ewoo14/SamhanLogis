package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.financial.VatInclusiveUnitAmountCalculator;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.AccountingPostedAtClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.DailyClosingAmountUpdateRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일마감 전용 금액 수정 경로.
 *
 * <p>기존 DRAFT/SAVED 전체 수정 경로를 넓히지 않고, 마감 표에 노출되는 금액만 수정한다.
 * 회계 allocation 존재 여부와 마감일 잠금을 이 경계에서 독립적으로 확인한다.
 */
@Service
@RequiredArgsConstructor
public class DailyClosingAmountUpdateService {

    private static final Set<SlipStatus> DAILY_STATUSES = EnumSet.of(
            SlipStatus.CONFIRMED, SlipStatus.DELIVERED, SlipStatus.COMPLETED);
    private static final String AUDIT_PREFIX = "DAILY_CLOSING_AMOUNT";

    private final SlipRepository slipRepository;
    private final AccountingPostedAtClient accountingPostedAtClient;
    private final SlipClosedDateGuard closedDateGuard;
    private final SlipAuditLogService auditLogService;
    private final SlipRevisionService slipRevisionService;

    /** 저장되는 값은 VAT 포함 단가이며, 출고가·할인율은 계산 근거로만 audit에 남긴다. */
    @Transactional
    public SlipDetailResponse update(UUID id, DailyClosingAmountUpdateRequest request,
                                     UUID actorId, String actorName) {
        Slip slip = slipRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        if (slip.getSlipType() != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.SLIP_UPDATE_NON_SALES,
                    "출고전표만 일마감 금액을 수정할 수 있습니다.");
        }
        if (!DAILY_STATUSES.contains(slip.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "일마감 금액 수정 대상 상태가 아닙니다: " + slip.getStatus().getDisplayName());
        }
        closedDateGuard.assertAmountEditAllowed(slip.getSlipType(), slip.getSlipDate());
        if (accountingPostedAtClient.hasAccountingSlip(slip.getSlipNo())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "회계전표가 있는 전표의 금액은 수정할 수 없습니다.");
        }
        verifyVersion(slip, request.updatedAt());

        List<SlipLine> lines = slip.getLines();
        if (request.lines().size() != lines.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "금액 전용 수정은 라인 추가·삭제를 허용하지 않습니다.");
        }
        List<SlipAuditLogService.ChangeEntry> changes = new java.util.ArrayList<>();
        for (int index = 0; index < request.lines().size(); index++) {
            DailyClosingAmountUpdateRequest.Line input = request.lines().get(index);
            SlipLine line = lines.get(index);
            if (!Objects.equals(line.getId(), input.lineId())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "금액 전용 수정 요청의 라인 순서가 현재 전표와 다릅니다.");
            }
            validateCalculation(input);
            VatInclusiveUnitAmountCalculator.Breakdown amounts =
                    VatInclusiveUnitAmountCalculator.calculate(input.unitPriceWithVat(), line.getQuantity());
            String oldUnit = text(line.getUnitPriceWithVat());
            String oldSupply = text(line.getSupplyAmount());
            String oldVat = text(line.getVatAmount());
            String oldTotal = text(line.getUnitPriceWithVat() == null
                    ? null : line.getUnitPriceWithVat().multiply(BigDecimal.valueOf(line.getQuantity())));
            line.changeUnitPriceWithVat(input.unitPriceWithVat());
            String path = AUDIT_PREFIX + ".line[" + index + "]";
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".unitPriceWithVat",
                    oldUnit, text(input.unitPriceWithVat())));
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".releasePrice",
                    null, text(input.releasePrice())));
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".discountRate",
                    null, text(input.discountRate())));
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".supplyAmount",
                    oldSupply, text(amounts.supplyAmount())));
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".vatAmount",
                    oldVat, text(amounts.vatAmount())));
            changes.add(new SlipAuditLogService.ChangeEntry(path + ".total",
                    oldTotal, text(amounts.totalAmount())));
        }
        try {
            Slip saved = slipRepository.saveAndFlush(slip);
            slipRevisionService.capture(saved, SlipRevisionType.EDIT, null, actorId, actorName, null);
            auditLogService.recordBatch(saved.getId(), actorId, actorName, null, changes);
            slipRepository.flush();
            return SlipDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw new BusinessException(ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                    ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
        }
    }

    private void validateCalculation(DailyClosingAmountUpdateRequest.Line line) {
        if (line.releasePrice().signum() == 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "출고가가 0이면 할인율을 계산할 수 없습니다.");
        }
        BigDecimal expected = BigDecimal.ONE.subtract(
                line.unitPriceWithVat().divide(line.releasePrice(), 8, RoundingMode.HALF_UP));
        if (expected.subtract(line.discountRate()).abs().compareTo(new BigDecimal("0.0001")) > 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "출고가·단가·할인율 계산 근거가 일치하지 않습니다.");
        }
    }

    private void verifyVersion(Slip slip, LocalDateTime requested) {
        LocalDateTime current = slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
        if (current == null || requested == null
                || !current.truncatedTo(ChronoUnit.MICROS)
                .isEqual(requested.truncatedTo(ChronoUnit.MICROS))) {
            throw new BusinessException(ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                    ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
        }
    }

    private String text(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }
}
