package com.samhanair.logis.slip.dto.dispatch;

import com.samhanair.logis.slip.domain.Slip;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 배차 메뉴 미배차 출고전표 목록 응답 — UUID 비공개 가드 (slipNo 노출).
 *
 * @param id 내부 식별자 (drag-and-drop 시 client side key 용)
 * @param slipNo 사용자 노출 전표번호 (예: 2026/05/14-1)
 * @param slipDate 영업일
 * @param partnerCode 거래처 코드
 * @param partnerName 거래처명
 * @param deliveryAddress 인수지
 * @param recipientPhone 인수자 전화번호
 * @param dispatchStatus 배차 상태 enum name
 */
public record SlipBoardResponse(
        UUID id,
        String slipNo,
        LocalDate slipDate,
        String partnerCode,
        String partnerName,
        String deliveryAddress,
        String recipientPhone,
        String dispatchStatus
) {

    public static SlipBoardResponse from(Slip slip) {
        return new SlipBoardResponse(
                slip.getId(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                slip.getDeliveryAddress(),
                slip.getRecipientPhone(),
                slip.getDispatchStatus() != null ? slip.getDispatchStatus().name() : null
        );
    }
}
