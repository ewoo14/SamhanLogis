package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매입 전표 direct PUT 수정 서비스.
 *
 * <p>WAREHOUSE/MANAGER/MASTER 가 기존 SlipEditRequest 승인 흐름을 거치지 않고 INBOUND 전표를
 * 즉시 수정한다. stale {@code updatedAt} 은 409 로, 라인 검증 실패는 422 로 반환한다.
 */
@Service
@RequiredArgsConstructor
public class SlipUpdateService {

    private final SlipRepository slipRepository;
    private final SlipAuditLogService auditLogService;

    /**
     * 매입 전표 헤더와 라인을 전체 교체한다.
     *
     * @param id 전표 ID
     * @param request 수정 요청
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 수정 후 상세 응답
     */
    @Transactional
    public SlipDetailResponse update(UUID id, SlipUpdateRequest request,
                                     UUID actorId, String actorName) {
        Slip slip = load(id);
        if (slip.getSlipType() != SlipType.INBOUND) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "매입 전표만 직접 수정할 수 있습니다.");
        }
        verifyVersion(slip, request.updatedAt());
        validateLines(request.lines());

        String before = summarize(slip);
        try {
            slip.updateHeader(
                    request.partnerName(),
                    request.partnerCode(),
                    request.memo(),
                    request.businessNumber(),
                    request.deliveryAddress(),
                    request.supervisionAddress(),
                    request.projectName(),
                    request.recipientPhone(),
                    request.paymentDueDate());
            slip.replaceLines(request.lines().stream()
                    .map(line -> toLine(slip, line))
                    .toList(), actorId == null ? null : actorId.toString());
            String after = summarize(slip);
            Slip saved = slipRepository.saveAndFlush(slip);
            if (!Objects.equals(before, after)) {
                auditLogService.recordBatch(saved.getId(), actorId, actorName, null,
                        List.of(new SlipAuditLogService.ChangeEntry("SLIP_EDIT", before, after)));
            }
            return SlipDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        } catch (IllegalArgumentException ex) {
            throw invalidLine(ex.getMessage());
        }
    }

    private Slip load(UUID id) {
        Slip slip = slipRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        if (Boolean.TRUE.equals(slip.getIsDeleted())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다");
        }
        return slip;
    }

    private void verifyVersion(Slip slip, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
        if (current == null || requestUpdatedAt == null || !current.isEqual(requestUpdatedAt)) {
            throw optimisticLockConflict();
        }
    }

    private void validateLines(List<SlipUpdateRequest.LineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw invalidLine("매입 라인은 1건 이상이어야 합니다.");
        }
        for (SlipUpdateRequest.LineRequest line : lines) {
            if (line.productId() == null) {
                throw invalidLine("제품 식별자는 필수입니다.");
            }
            if (line.quantity() == null || line.quantity() <= 0) {
                throw invalidLine("수량은 1 이상이어야 합니다.");
            }
            if (line.unitPrice() == null || line.unitPrice().signum() < 0) {
                throw invalidLine("단가는 0 이상이어야 합니다.");
            }
        }
    }

    private SlipLine toLine(Slip slip, SlipUpdateRequest.LineRequest line) {
        return SlipLine.create(
                slip,
                line.productId(),
                line.productName(),
                line.modelName(),
                line.specification(),
                line.quantity(),
                line.unitPrice(),
                line.note());
    }

    private String summarize(Slip slip) {
        return "partnerName=%s|partnerCode=%s|memo=%s|businessNumber=%s|deliveryAddress=%s|projectName=%s|recipientPhone=%s|paymentDueDate=%s|lines=%s"
                .formatted(
                        nullToEmpty(slip.getPartnerName()),
                        nullToEmpty(slip.getPartnerCode()),
                        nullToEmpty(slip.getMemo()),
                        nullToEmpty(slip.getBusinessNumber()),
                        nullToEmpty(slip.getDeliveryAddress()),
                        nullToEmpty(slip.getProjectName()),
                        nullToEmpty(slip.getRecipientPhone()),
                        toText(slip.getPaymentDueDate()),
                        summarizeLines(slip.getLines()));
    }

    private String summarizeLines(List<SlipLine> lines) {
        return lines.stream()
                .map(line -> "%s/%s/%d/%s".formatted(
                        nullToEmpty(line.getModelName()),
                        nullToEmpty(line.getProductName()),
                        line.getQuantity(),
                        normalize(line.getUnitPrice())))
                .toList()
                .toString();
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String toText(LocalDate value) {
        return value == null ? "" : value.toString();
    }

    private String normalize(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
    }

    private BusinessException invalidLine(String message) {
        return new BusinessException(ErrorCode.SLIP_UPDATE_INVALID_LINE, message);
    }
}
