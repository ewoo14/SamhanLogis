package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.web.dto.HistoryResponse;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 history 조회 서비스 (legacy getOrderHistory 8104).
 * UUID 미노출 — bizCode + orderNo 만 사용자 노출.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderHistoryService {

    private final PartnerOrderRepository orderRepository;

    /**
     * 거래처 history 페이지 조회.
     *
     * @param bizCode 사업자번호
     * @param from 시작 일시
     * @param to 종료 일시
     * @param pageable 페이지
     * @return Page&lt;HistoryResponse&gt;
     */
    @Transactional(readOnly = true)
    public Page<HistoryResponse> findHistory(String bizCode, LocalDateTime from, LocalDateTime to,
                                             Pageable pageable) {
        if (bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizCode 필수");
        }
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from/to 필수");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from 이 to 보다 이후일 수 없습니다");
        }
        return orderRepository
                .findAllByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(bizCode, from, to, pageable)
                .map(HistoryResponse::from);
    }
}
