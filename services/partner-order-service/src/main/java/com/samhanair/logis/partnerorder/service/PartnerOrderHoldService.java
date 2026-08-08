package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 보류(ON_HOLD) 상태 전이 서비스 (Phase 2.5).
 *
 * <p>전이 규칙:
 * <ul>
 *   <li>{@link #hold} — DRAFT → ON_HOLD (보류). DRAFT 가 아니면 도메인 메서드가 409 발생.</li>
 *   <li>{@link #release} — ON_HOLD → DRAFT (보류 해제). ON_HOLD 가 아니면 도메인 메서드가 409 발생.</li>
 * </ul>
 *
 * <p>actorId/actorName 은 현재 단순 전이에 사용되지 않으나, 향후 STATUS revision 캡처 연결
 * (설계서 §4.2 선택사항)을 위해 시그니처에 유지한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderHoldService {

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;
    private final PartnerOrderAuthorityEventPublisher authorityEventPublisher;

    /**
     * 진행중(DRAFT) 주문을 보류(ON_HOLD)로 전이한다.
     *
     * <p>주문을 조회한 후 {@link PartnerOrder#markOnHold()} 를 호출한다.
     * DRAFT 가 아닌 주문에 호출하면 도메인 메서드에서 409 CONFLICT 가 발생한다.
     *
     * @param id       주문번호 또는 내부 UUID 문자열
     * @param actorId  변경 주체 UUID 문자열 (감사용, 미래 revision 훅 대비)
     * @param actorName 변경 주체 표시명 (감사용, 미래 revision 훅 대비)
     * @return 전이 후 주문 상세 DTO
     */
    @Transactional
    public PartnerOrderDetailResponse hold(String id, String actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.markOnHold();
        partnerOrderRepository.saveAndFlush(order);
        publishListChanged(order.getId());
        return PartnerOrderDetailResponse.from(order);
    }

    /**
     * 보류(ON_HOLD) 주문을 진행중(DRAFT)으로 되돌린다.
     *
     * <p>주문을 조회한 후 {@link PartnerOrder#releaseHold()} 를 호출한다.
     * ON_HOLD 가 아닌 주문에 호출하면 도메인 메서드에서 409 CONFLICT 가 발생한다.
     *
     * @param id       주문번호 또는 내부 UUID 문자열
     * @param actorId  변경 주체 UUID 문자열 (감사용, 미래 revision 훅 대비)
     * @param actorName 변경 주체 표시명 (감사용, 미래 revision 훅 대비)
     * @return 전이 후 주문 상세 DTO
     */
    @Transactional
    public PartnerOrderDetailResponse release(String id, String actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.releaseHold();
        partnerOrderRepository.saveAndFlush(order);
        publishListChanged(order.getId());
        return PartnerOrderDetailResponse.from(order);
    }

    private void publishListChanged(UUID orderId) {
        if (authorityEventPublisher != null) {
            authorityEventPublisher.publish(orderId, "STATUS", null);
        }
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("UPDATED");
        }
    }
}
