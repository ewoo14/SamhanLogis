package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 배차 계열이 공유하는 전표 단위 출고 projection.
 *
 * <p>응답에는 전표번호와 거래처 업무 식별자만 포함한다. 내부 전표 UUID·거래처 UUID는
 * 서비스 경계를 넘기지 않는다. {@code scheduledAt}은 현재 Slip 모델에 배차 예정 시각이
 * 없어 null이며 호출자 계약 호환을 위해 필드를 유지한다.
 *
 * @param slipNo 사용자 노출 전표번호
 * @param partnerCode 거래처 코드
 * @param partnerName 거래처명 snapshot
 * @param slipDate 출고일
 * @param scheduledAt 배차 예정 시각, 현재 미지원
 * @param deliveryTag 배송 태그 (REGION/STACK 등, 미지정 시 null)
 * @param deliveryAddress 배송지 주소
 * @param lines 품목명·수량 목록
 * @param recipientPhone 인수자 전화번호
 */
public record OutboundSlipResponse(
        String slipNo,
        String partnerCode,
        String partnerName,
        LocalDate slipDate,
        LocalDateTime scheduledAt,
        DeliveryTag deliveryTag,
        String deliveryAddress,
        List<Line> lines,
        String recipientPhone,
        LocalDate unloadDate,
        String driverPhone) {

    /** 전표 entity를 UUID 없는 배차 응답으로 변환한다. */
    public static OutboundSlipResponse from(Slip slip) {
        return new OutboundSlipResponse(
                slip.getSlipNo(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                slip.getSlipDate(),
                null,
                slip.getDeliveryTag(),
                slip.getDeliveryAddress(),
                slip.getLines().stream().map(Line::from).toList(),
                slip.getRecipientPhone(),
                slip.getUnloadDate(),
                slip.getDriverPhone());
    }

    /** 배차 메시지에 필요한 품목 단위 projection. */
    public record Line(String productName, int quantity) {

        private static Line from(SlipLine line) {
            return new Line(line.getProductName(), line.getQuantity());
        }
    }
}
