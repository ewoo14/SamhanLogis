package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.time.LocalDateTime;
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
    private final PartnerOrderLineRepository lineRepository;
    private final PartnerOrderAuditLogService auditLogService;
    private final PartnerOrderRevisionService revisionService;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

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

        order.softDeleteCascadeWithName(actorUserId(actorId), resolveActorName(actorId, actorName), LocalDateTime.now());
        partnerOrderRepository.saveAndFlush(order);
        auditLogService.recordBatch(order, actorId, actorName, null,
                List.of(new ChangeEntry("DELETE", null, "soft-deleted")));
        publishListChanged("DELETED");
    }

    /**
     * 목록 인라인 복원. 삭제 전 revision point-in-time 복원과 별개로 soft-delete 플래그만 되돌린다.
     *
     * <p><b>라인 복원 = 헤더 deletedAt 정확일치 매칭</b>. 주문 라인은 수정 플로우에서도 개별
     * soft-delete 되므로({@code markDeleted("system-partner-order-update")} 등) 판매전표(D)식
     * "삭제 라인 전량복원" 은 수정으로 제거된 라인을 오복원한다 — 의도적으로 미채택(#757 R2 LOW
     * disposition). 같은 삭제 작업의 라인만 헤더와 동일 시각({@code softDeleteCascadeWithName}
     * 단일시각 보장)으로 식별해 복원한다.
     *
     * <p>한계(레거시): 단일시각 도입 전 구 {@code softDeleteCascade(String)} 삭제분은 헤더≠라인
     * 시각이라 인라인 복원 시 라인이 남지 않을 수 있다 — 그 경우 삭제 직전 스냅샷을 보존하는
     * 버전이력(DELETE revision) 복원 경로가 정식 복구 수단이다.
     */
    @Transactional
    public PartnerOrderDetailResponse restoreDeleted(String id, UUID actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifierIncludingDeleted(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        if (!Boolean.TRUE.equals(order.getIsDeleted())) {
            return PartnerOrderDetailResponse.from(order);
        }
        // CONFIRMING(전환 중) 상태로 삭제된 주문의 인라인 복원은 전환-중 좀비 행을 부활시켜
        // 이후 어떤 도메인 메서드로도 복구 불가하므로 차단(409). revision restore 경로와 정합.
        order.requireRestorable();

        LocalDateTime deletedAt = order.getDeletedAt();
        List<PartnerOrderLine> lines = lineRepository.findAllIncludingDeletedByPartnerOrderId(order.getId());
        long deletedLineCount = lines.stream()
                .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                .count();
        long restoredLines = lines.stream()
                .filter(line -> Boolean.TRUE.equals(line.getIsDeleted()))
                .filter(line -> deletedAt != null && deletedAt.equals(line.getDeletedAt()))
                .count();
        if (deletedLineCount != restoredLines) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "주문의 삭제 라인 그래프를 정확히 복원할 수 없습니다: " + order.getOrderNo());
        }
        order.restoreFromDeleted();
        for (PartnerOrderLine line : lines) {
            if (Boolean.TRUE.equals(line.getIsDeleted()) && deletedAt != null && deletedAt.equals(line.getDeletedAt())) {
                line.markRestored();
            }
        }
        PartnerOrder saved = partnerOrderRepository.saveAndFlush(order);
        lineRepository.saveAll(lines);
        auditLogService.recordBatch(saved, actorId, actorName, null,
                List.of(new ChangeEntry("RESTORE", "soft-deleted", null)));
        publishListChanged("RESTORED");
        return PartnerOrderDetailResponse.from(saved);
    }

    private void publishListChanged(String changeType) {
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged(changeType);
        }
    }

    private String actorUserId(UUID actorId) {
        return actorId == null ? new UUID(0L, 0L).toString() : actorId.toString();
    }

    private String resolveActorName(UUID actorId, String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        if (actorId != null && actorId.toString().equalsIgnoreCase(trimmed)) {
            return null;
        }
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }
}
