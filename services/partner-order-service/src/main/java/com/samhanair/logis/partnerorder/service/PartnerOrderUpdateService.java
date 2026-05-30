package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderUpdateRequest;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 direct PUT 수정 서비스.
 *
 * <p>정책: 본사 SALES/MANAGER/MASTER 는 즉시 수정하고, PARTNER 는 기존 EditRequest 승인 흐름을
 * 사용한다. 수정 성공 시 audit overlay 를 1개 revision 으로 기록한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderUpdateService {

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderAuditLogService auditLogService;
    private final PartnerOrderRevisionService revisionService;

    /**
     * 주문 헤더와 라인을 즉시 수정한다.
     *
     * <p>변경 저장 성공 후 {@link PartnerOrderRevisionService#capture} 로 EDIT 유형 revision 을
     * 트랜잭션 내에서 캡처한다 (Phase 2.4 버전이력 훅). 변경이 없는 경우에는 캡처하지 않는다.
     *
     * @param id 주문번호 또는 내부 식별자 문자열
     * @param request 수정 요청
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명 (UUID 비공개 가드 적용 전 원본)
     * @return 수정 후 상세 응답
     */
    @Transactional
    public PartnerOrderDetailResponse update(String id, PartnerOrderUpdateRequest request,
                                             UUID actorId, String actorName) {
        PartnerOrder order = load(id);
        verifyVersion(order, request.updatedAt());
        validateLines(request.lines());

        List<ChangeEntry> changes = diff(order, request);
        if (changes.isEmpty()) {
            return PartnerOrderDetailResponse.from(order);
        }
        try {
            order.updateHeader(request.partnerCode(), request.bizCode(), request.dueDate(), request.memo());
            order.replaceLines(request.lines().stream().map(this::toLine).toList());
            PartnerOrder saved = partnerOrderRepository.saveAndFlush(order);

            auditLogService.recordBatch(saved, actorId, actorName, null, changes);

            // Phase 2.4 버전이력 훅 — 본사 직결 수정 후 스냅샷 캡처 (EDIT)
            revisionService.capture(saved, PartnerOrderRevisionType.EDIT, null,
                    actorId, actorName, null);

            return PartnerOrderDetailResponse.from(saved);
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw optimisticLockConflict();
        }
    }

    private PartnerOrder load(String id) {
        return PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
    }

    private void verifyVersion(PartnerOrder order, LocalDateTime requestUpdatedAt) {
        LocalDateTime current = order.getModifiedAt() == null ? order.getCreatedAt() : order.getModifiedAt();
        if (current == null || requestUpdatedAt == null || !current.isEqual(requestUpdatedAt)) {
            throw optimisticLockConflict();
        }
    }

    private BusinessException optimisticLockConflict() {
        return new BusinessException(
                ErrorCode.PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT,
                ErrorCode.PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage());
    }

    private void validateLines(List<PartnerOrderUpdateRequest.LineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            throw invalidLine("주문 라인은 1건 이상이어야 합니다.");
        }
        for (PartnerOrderUpdateRequest.LineRequest line : lines) {
            if (line.quantity() <= 0) {
                throw invalidLine("수량은 1 이상이어야 합니다.");
            }
            if (line.deliveryPrice() == null || line.deliveryPrice().signum() < 0) {
                throw invalidLine("납품가는 0 이상이어야 합니다.");
            }
        }
    }

    private BusinessException invalidLine(String message) {
        return new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE, message);
    }

    private PartnerOrderLine toLine(PartnerOrderUpdateRequest.LineRequest line) {
        return PartnerOrderLine.create(
                stableProductId(line.modelCode(), line.productName(), line.categoryKey()),
                line.modelCode(),
                line.productName(),
                line.categoryKey(),
                line.quantity(),
                line.deliveryPrice(),
                line.remark());
    }

    private List<ChangeEntry> diff(PartnerOrder order, PartnerOrderUpdateRequest request) {
        List<ChangeEntry> changes = new ArrayList<>();
        addIfChanged(changes, "거래처 코드", order.getPartnerCode(), request.partnerCode());
        addIfChanged(changes, "사업자번호", order.getBizCode(), request.bizCode());
        addIfChanged(changes, "납기", toText(order.getDueDate()), toText(request.dueDate()));
        addIfChanged(changes, "요청사항", order.getMemo(), trimToNull(request.memo()));
        String oldLines = summarizeLines(order.getLines());
        String newLines = summarizeRequestLines(request.lines());
        addIfChanged(changes, "주문 라인", oldLines, newLines);
        return changes;
    }

    private void addIfChanged(List<ChangeEntry> changes, String fieldName, String oldValue, String newValue) {
        String oldText = oldValue == null ? "" : oldValue;
        String newText = newValue == null ? "" : newValue;
        if (!Objects.equals(oldText, newText)) {
            changes.add(new ChangeEntry(fieldName, oldValue, newValue));
        }
    }

    private String summarizeLines(List<PartnerOrderLine> lines) {
        return lines.stream()
                .map(line -> line.getModelName() + "/" + line.getProductName() + "/" + line.getQuantity()
                        + "/" + normalize(line.getPriceVat()))
                .toList()
                .toString();
    }

    private String summarizeRequestLines(List<PartnerOrderUpdateRequest.LineRequest> lines) {
        return lines.stream()
                .map(line -> line.modelCode() + "/" + line.productName() + "/" + line.quantity()
                        + "/" + normalize(line.deliveryPrice()))
                .toList()
                .toString();
    }

    private String toText(LocalDate value) {
        return value == null ? null : value.toString();
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalize(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    private UUID stableProductId(String modelCode, String productName, String categoryKey) {
        String seed = "partner-order-update:%s:%s:%s".formatted(modelCode, productName, categoryKey);
        return UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8));
    }

}
