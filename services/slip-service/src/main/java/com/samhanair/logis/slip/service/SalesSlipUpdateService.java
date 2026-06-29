package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매출 전표 direct PUT 수정 서비스 (SP-08-6-2).
 *
 * <p>SALES/MANAGER/MASTER 가 기존 SlipEditRequest 승인 흐름을 거치지 않고 OUTBOUND 전표를
 * 즉시 수정한다. stale {@code updatedAt} 은 409 로, 라인 검증 실패는 422 로 반환한다.
 *
 * <p>SP-08-5-2 {@link SlipUpdateService} (매입) 와 대칭 패턴을 사용하되 도메인 메서드만
 * {@code updateSalesHeader} / {@code replaceSalesLines} 로 교체한다.
 */
@Service
@RequiredArgsConstructor
public class SalesSlipUpdateService {

    private final SlipRepository slipRepository;
    private final SlipAuditLogService auditLogService;
    private final SlipRevisionService slipRevisionService;

    /**
     * 매출 전표 헤더와 라인을 전체 교체한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>전표 조회 및 OUTBOUND 타입 검증 (도메인 메서드에 위임)</li>
     *   <li>라인 유효성 검증 — try 외부에서 즉시 처리</li>
     *   <li>수정 전 스냅샷 {@code before} 캡처 (도메인 변경 전)</li>
     *   <li>도메인 메서드 호출 후 {@code saveAndFlush}</li>
     *   <li>flush 결과 기준 {@code after} 캡처 → 변경 있을 때만 audit 기록</li>
     * </ol>
     *
     * @param id 전표 ID
     * @param request 수정 요청 (SlipUpdateRequest 재사용)
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 수정 후 상세 응답
     * @throws BusinessException(SLIP_UPDATE_NON_SALES) slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(SLIP_OPTIMISTIC_LOCK_CONFLICT) stale updatedAt 일 때
     * @throws BusinessException(SLIP_UPDATE_INVALID_LINE) 라인 유효성 실패 시
     */
    @Transactional
    public SlipDetailResponse update(UUID id, SlipUpdateRequest request,
                                     UUID actorId, String actorName) {
        Slip slip = load(id);
        verifyVersion(slip, request.updatedAt());
        // validateLines 는 BusinessException(SLIP_UPDATE_INVALID_LINE) 을 던지므로 try 외부에서 처리
        validateLines(request.lines());

        String before = summarize(slip);
        try {
            slip.updateSalesHeader(
                    request.partnerName(),
                    request.partnerCode(),
                    request.memo(),
                    request.businessNumber(),
                    request.deliveryAddress(),
                    request.supervisionAddress(),
                    request.projectName(),
                    request.recipientPhone(),
                    request.paymentDueDate());
            slip.replaceSalesLines(request.lines().stream()
                    .map(line -> toLine(slip, line))
                    .toList(), actorId == null ? null : actorId.toString());
            Slip saved = slipRepository.saveAndFlush(slip);
            // after 는 saveAndFlush 결과 기준으로 캡처하여 ordering 명확화
            String after = summarize(saved);
            if (!Objects.equals(before, after)) {
                // 버전 스냅샷은 audit revisionCount 증가와 독립 기록해 기존 PUT 응답 version 계약을 보존한다.
                slipRevisionService.capture(saved, SlipRevisionType.EDIT, null, actorId, actorName, null);
                auditLogService.recordBatch(saved.getId(), actorId, actorName, null,
                        List.of(new SlipAuditLogService.ChangeEntry("SLIP_EDIT", before, after)));
            }
            return SlipDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
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

    /**
     * {@code updatedAt} 낙관적 잠금 검증.
     *
     * <p>PostgreSQL {@code timestamp(6)} 은 마이크로초 단위. Java {@code LocalDateTime} 도
     * 나노초를 지원하므로 양쪽을 {@link ChronoUnit#MICROS} 로 truncate 후 비교하여
     * 정밀도 불일치로 인한 오탐을 방지한다.
     *
     * @param slip 현재 전표
     * @param requestUpdatedAt 클라이언트 전송 타임스탬프
     */
    private void verifyVersion(Slip slip, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = slip.getModifiedAt() == null ? slip.getCreatedAt() : slip.getModifiedAt();
        if (current == null || requestUpdatedAt == null) {
            throw optimisticLockConflict();
        }
        LocalDateTime currentMicros = current.truncatedTo(ChronoUnit.MICROS);
        LocalDateTime requestMicros = requestUpdatedAt.truncatedTo(ChronoUnit.MICROS);
        if (!currentMicros.isEqual(requestMicros)) {
            throw optimisticLockConflict();
        }
    }

    private void validateLines(List<SlipUpdateRequest.LineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw invalidLine("매출 라인은 1건 이상이어야 합니다.");
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
        return "partnerName=%s|partnerCode=%s|memo=%s|businessNumber=%s|deliveryAddress=%s|supervisionAddress=%s|projectName=%s|recipientPhone=%s|paymentDueDate=%s|lines=%s"
                .formatted(
                        nullToEmpty(slip.getPartnerName()),
                        nullToEmpty(slip.getPartnerCode()),
                        nullToEmpty(slip.getMemo()),
                        nullToEmpty(slip.getBusinessNumber()),
                        nullToEmpty(slip.getDeliveryAddress()),
                        nullToEmpty(slip.getSupervisionAddress()),
                        nullToEmpty(slip.getProjectName()),
                        nullToEmpty(slip.getRecipientPhone()),
                        toText(slip.getPaymentDueDate()),
                        summarizeLines(slip.getLines()));
    }

    private String summarizeLines(List<SlipLine> lines) {
        return String.join(",", lines.stream()
                .map(line -> "%s/%s/%s/%s/%d/%s/%s".formatted(
                        line.getProductId() == null ? "" : line.getProductId().toString(),
                        nullToEmpty(line.getModelName()),
                        nullToEmpty(line.getProductName()),
                        nullToEmpty(line.getSpecification()),
                        line.getQuantity(),
                        normalize(line.getUnitPrice()),
                        nullToEmpty(line.getNote())))
                .toList());
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
