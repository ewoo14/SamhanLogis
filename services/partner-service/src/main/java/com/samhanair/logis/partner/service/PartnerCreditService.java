package com.samhanair.logis.partner.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerCreditHistory;
import com.samhanair.logis.partner.repository.PartnerCreditHistoryRepository;
import com.samhanair.logis.partner.realtime.PartnerListRealtime;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 신용 거래 (한도 / 미수금) 갱신 + 이력 적재.
 *
 * <p>본 service 의 모든 mutator 는 단일 transaction 내에서 (1) {@link Partner} 의 잔액/한도 갱신과
 * (2) {@link PartnerCreditHistory} 의 이력 row 적재를 함께 처리한다. 일관성 가드.
 *
 * <p>{@link PartnerService#findByCode(String)} 호출로 entity 를 lookup 하므로, 본 service 의
 * 모든 메서드는 Partner JPA managed entity 를 받는다.
 */
@Service
@RequiredArgsConstructor
public class PartnerCreditService {

    private final PartnerService partnerService;
    private final PartnerCreditHistoryRepository historyRepository;
    private final CollectionRealtimePublisher collectionRealtimePublisher;

    /**
     * 슬립 발행으로 미수금 증가 + 이력 적재.
     *
     * <p>발행 전 {@link Partner#canIssueSlip(BigDecimal)} 가드로 한도 초과 또는 비활성 상태 거부.
     *
     * @param partnerCode 사용자 노출 식별자
     * @param amount 슬립 금액 (양수)
     * @param slipNo slip 번호 (reference_no 적재)
     * @return 적재된 history row
     * @throws BusinessException 한도 초과 또는 비활성 상태 시 CONFLICT
     */
    @Transactional
    public PartnerCreditHistory recordSlipIssued(String partnerCode, BigDecimal amount, String slipNo) {
        Partner partner = partnerService.findByCode(partnerCode);
        if (!partner.canIssueSlip(amount)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "신용한도 초과 또는 비활성 거래처: code=" + partnerCode
                            + ", balance=" + partner.getOutstandingBalance()
                            + ", limit=" + partner.getCreditLimit()
                            + ", status=" + partner.getStatus());
        }
        partner.increaseBalance(amount);
        PartnerCreditHistory saved = historyRepository.save(PartnerCreditHistory.slipIssued(partner, amount, slipNo));
        publishListChanged();
        return saved;
    }

    /**
     * 결제 입금으로 미수금 차감 + 이력 적재.
     *
     * @param partnerCode 사용자 노출 식별자
     * @param amount 결제 금액 (양수, 잔액 초과 차감 거부)
     * @param paymentNo 입금 번호
     * @param note 메모 (선택)
     */
    @Transactional
    public PartnerCreditHistory recordPayment(String partnerCode, BigDecimal amount, String paymentNo, String note) {
        Partner partner = partnerService.findByCode(partnerCode);
        partner.decreaseBalance(amount);
        PartnerCreditHistory saved = historyRepository.save(PartnerCreditHistory.payment(partner, amount, paymentNo, note));
        publishListChanged();
        return saved;
    }

    /**
     * 신용한도 변경 + 이력 적재.
     *
     * @param partnerCode 사용자 노출 식별자
     * @param newLimit 새 한도 (0 이상)
     * @param note 사유 (선택)
     */
    @Transactional
    public PartnerCreditHistory changeCreditLimit(String partnerCode, BigDecimal newLimit, String note) {
        Partner partner = partnerService.findByCode(partnerCode);
        BigDecimal delta = partner.changeCreditLimit(newLimit);
        PartnerCreditHistory saved = historyRepository.save(PartnerCreditHistory.creditLimitChange(partner, delta, note));
        publishListChanged();
        return saved;
    }

    /**
     * 거래처 이력 페이지 조회 (admin 화면).
     */
    @Transactional(readOnly = true)
    public Page<PartnerCreditHistory> findHistory(String partnerCode, Pageable pageable) {
        Partner partner = partnerService.findByCode(partnerCode);
        return historyRepository.findAllByPartnerIdOrderByOccurredAtDesc(partner.getId(), pageable);
    }

    /**
     * 신용 거래 이력 일괄 적재 결과 (admin 응답용).
     *
     * <p>본 메서드는 단순 wrapper — list 반환 시 Pageable 미사용 호출 위치 (예: dev-tools) 용.
     */
    @Transactional(readOnly = true)
    public List<PartnerCreditHistory> findHistoryAll(String partnerCode) {
        Partner partner = partnerService.findByCode(partnerCode);
        return historyRepository.findAllByPartnerIdOrderByOccurredAtDesc(partner.getId(), Pageable.unpaged())
                .getContent();
    }

    private void publishListChanged() {
        collectionRealtimePublisher.publishChange(
                PartnerListRealtime.CHANNEL_ID,
                PartnerListRealtime.EVENT_CHANGED,
                Map.of("changeType", "UPDATED"));
    }
}
