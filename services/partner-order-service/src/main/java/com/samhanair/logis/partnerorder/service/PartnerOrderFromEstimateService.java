package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적 snapshot 을 거래처 주문으로 변환한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderFromEstimateService {

    private static final DateTimeFormatter ORDER_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderAuditLogService auditLogService;
    private final EstimateClient estimateClient;
    private final EntityManager entityManager;

    /**
     * 견적 UUID 를 주문으로 변환한다. 동일 estimateId 는 active 주문 1건만 허용한다.
     */
    @Transactional
    public PartnerOrderDetailResponse createFromEstimate(UUID estimateId, UUID actorId, String actorName) {
        if (partnerOrderRepository.findBySourceEstimateId(estimateId).isPresent()) {
            throw alreadyConverted();
        }
        EstimateClient.EstimateSnapshot snapshot = estimateClient.findById(estimateId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND.getDefaultMessage()));

        PartnerOrder order = PartnerOrder.createFromEstimate(
                snapshot.partnerCode(),
                snapshot.bizCode(),
                nextOrderNo(),
                "PO-EST-" + snapshot.estimateId(),
                BigDecimal.ZERO,
                snapshot.estimateId(),
                parseDate(snapshot.dueDate()),
                snapshot.memo());
        for (EstimateClient.EstimateLineSnapshot line : snapshot.lines()) {
            order.addLine(PartnerOrderLine.create(
                    line.productId(),
                    line.modelCode(),
                    line.productName(),
                    line.categoryKey(),
                    line.quantity(),
                    line.deliveryPrice(),
                    line.remark()));
        }
        order.recomputeTotal();
        PartnerOrder saved = partnerOrderRepository.saveAndFlush(order);
        auditLogService.recordBatch(saved, actorId, actorName, null,
                List.of(new ChangeEntry("FROM_ESTIMATE", null, snapshot.estimateNumber())));
        return PartnerOrderDetailResponse.from(saved);
    }

    private BusinessException alreadyConverted() {
        return new BusinessException(
                ErrorCode.PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED,
                ErrorCode.PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED.getDefaultMessage());
    }

    private String nextOrderNo() {
        String datePrefix = LocalDate.now().format(ORDER_NO_DATE);
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))")
                .setParameter(1, "partner_order_seq_" + datePrefix)
                .getSingleResult();
        int maxSeq = 0;
        for (PartnerOrder order : partnerOrderRepository.findAllByOrderNoStartingWith(datePrefix)) {
            maxSeq = Math.max(maxSeq, extractOrderSeq(datePrefix, order.getOrderNo()));
        }
        return datePrefix + "-" + (maxSeq + 1);
    }

    private int extractOrderSeq(String datePrefix, String orderNo) {
        if (orderNo == null || !orderNo.startsWith(datePrefix)) {
            return 0;
        }
        String suffix = orderNo.substring(datePrefix.length()).trim();
        if (suffix.startsWith("-")) {
            suffix = suffix.substring(1).trim();
        }
        try {
            return Integer.parseInt(suffix);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }
}
