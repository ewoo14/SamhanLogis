package com.samhanair.logis.slip.dto.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatchChannel;
import java.time.LocalDate;
import java.util.List;

/**
 * 타배송사 배차의뢰서 인쇄 데이터.
 *
 * <p>UUID 는 인쇄 응답에 포함하지 않는다. 화면에는 배송사명, 연락처, 전표번호, 배송지,
 * 수령자, 품목요약처럼 운영자가 식별할 수 있는 업무 식별자만 노출한다.
 *
 * @param carrierName 배송사/기사명
 * @param carrierPhone 배송사/기사 연락처
 * @param dispatchDate 발송 기준일
 * @param channel 발송 채널
 * @param items 전표별 인쇄 행
 */
public record ExternalDispatchPrintDataResponse(
        String carrierName,
        String carrierPhone,
        LocalDate dispatchDate,
        ExternalDispatchChannel channel,
        List<PrintSlipLine> items
) {

    /**
     * 배차의뢰서 전표 1행.
     *
     * @param slipNo 사용자 노출 전표번호
     * @param deliveryAddress 배송지
     * @param recipientName 수령자/거래처명
     * @param recipientPhone 수령자 연락처
     * @param itemSummary SMS 본문과 동일한 대표 품목 요약
     * @param sequence 발송 이력 내 전표 순서
     */
    public record PrintSlipLine(
            String slipNo,
            String deliveryAddress,
            String recipientName,
            String recipientPhone,
            String itemSummary,
            int sequence
    ) {
    }
}
