package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 soft delete 서비스.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderDeleteService {

    private static final Set<PartnerOrderStatus> DELETABLE_STATUSES =
            EnumSet.of(PartnerOrderStatus.DRAFT, PartnerOrderStatus.CONFIRMING);

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderAuditLogService auditLogService;

    /**
     * 주문과 전체 라인을 soft-delete 처리한다.
     */
    @Transactional
    public void delete(String id, UUID actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        if (!DELETABLE_STATUSES.contains(order.getStatus())) {
            throw new BusinessException(
                    ErrorCode.PARTNER_ORDER_DELETE_FORBIDDEN_STATUS,
                    ErrorCode.PARTNER_ORDER_DELETE_FORBIDDEN_STATUS.getDefaultMessage());
        }
        order.softDeleteCascade(resolveActorName(actorName));
        partnerOrderRepository.saveAndFlush(order);
        auditLogService.recordBatch(order, actorId, actorName, null,
                List.of(new ChangeEntry("DELETE", null, "soft-deleted")));
    }

    private String resolveActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return "system";
        }
        return actorName;
    }
}
