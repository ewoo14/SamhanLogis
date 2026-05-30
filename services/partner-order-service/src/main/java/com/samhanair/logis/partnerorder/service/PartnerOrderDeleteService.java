package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
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
 *
 * <p>삭제는 "되돌릴 수 있는 변경"으로 취급한다 (설계서 §3.3a).
 * soft-delete {@link PartnerOrder#softDeleteCascade(String)} <b>직전</b>에
 * {@link PartnerOrderRevisionType#DELETE} revision 을 캡처해 버전이력에 삭제 시점 스냅샷을 보존한다.
 * 이를 통해 버전이력 복원(restore) 경로에서 삭제된 주문도 해당 revision 을 타겟으로 복원 가능하다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderDeleteService {

    private static final Set<PartnerOrderStatus> DELETABLE_STATUSES =
            EnumSet.of(PartnerOrderStatus.DRAFT, PartnerOrderStatus.CONFIRMING);

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderAuditLogService auditLogService;
    private final PartnerOrderRevisionService revisionService;

    /**
     * 주문과 전체 라인을 soft-delete 처리한다.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>주문 조회 + 삭제 가능 상태 검증 (DRAFT / CONFIRMING 만 허용)</li>
     *   <li>DELETE revision 캡처 — soft-delete <b>직전</b> 활성 상태 스냅샷 보존</li>
     *   <li>{@link PartnerOrder#softDeleteCascade(String)} — 헤더 + 라인 일괄 soft-delete</li>
     *   <li>감사 로그 기록</li>
     * </ol>
     *
     * @param id       주문 UUID 문자열 또는 주문번호 (orderNo)
     * @param actorId  변경 주체 UUID (감사용)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드 적용 전 원본)
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

        // DELETE revision 캡처 — soft-delete 직전 활성 상태 스냅샷 보존
        // 순서 중요: softDeleteCascade 이전에 호출해야 활성 라인을 포함한 스냅샷이 생성됨
        revisionService.capture(order, PartnerOrderRevisionType.DELETE, null,
                actorId, actorName, null);

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
