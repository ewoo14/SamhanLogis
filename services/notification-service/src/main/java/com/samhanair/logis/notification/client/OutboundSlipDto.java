package com.samhanair.logis.notification.client;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 배차안내 SMS 발송용 출고전표 단건 view (PR-E1 BE-4 — Samhan Public 이식).
 *
 * <p>slip-service 의 {@code GET /internal/slips/outbound?from=&to=} 응답 1건 매핑.
 * 본 DTO 는 notification-service 내부에서만 사용되며 slip-service 의 entity/내부 DTO 와 결합하지 않는다
 * (Layer 4 외부 client 격리 패턴 — IT 에서 {@code @MockBean} 으로 격리, memory feedback_it_mockbean_external_clients).
 *
 * <p>UUID 비공개 가드 — partnerId / slipId 는 응답에 포함하지 않고 사용자 노출 식별자
 * (partnerCode / slipNo) 만 사용. 단톡방 매핑/blocked 가드 모두 partner_code 를 키로 한다.
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 메시지 템플릿 변수 — slipDate(시간) / deliveryAddress(주소) /
 * lines(품목명+수량) — 가 본 DTO 에 포함된다. {@link MessageTemplateService} 가 본 DTO 를 입력으로
 * 받아 한국어 안내 문자열을 조립.
 *
 * @param slipNo 사용자 노출 전표번호 (예: "OUT-2026-05-10-001")
 * @param partnerCode 거래처코드 (단톡방 매핑/blocked 가드 키)
 * @param partnerName 거래처 사업자명 (사용자 노출, partner-service snapshot)
 * @param slipDate 출고일자 (배차일)
 * @param scheduledAt 배차 예정 시각 (메시지 템플릿 시간 변수, null 가능 — 미지정 시 시간 omit)
 * @param deliveryAddress 배송지 주소 (메시지 템플릿 주소 변수)
 * @param lines 라인 목록 (품목명 + 수량) — 메시지 템플릿 품목/수량 변수
 * @param recipientPhone 인수자 전화번호 — 단톡방 매핑이 없을 때 SMS fallback 대상
 */
public record OutboundSlipDto(
        String slipNo,
        String partnerCode,
        String partnerName,
        LocalDate slipDate,
        LocalDateTime scheduledAt,
        String deliveryAddress,
        List<OutboundSlipLineDto> lines,
        String recipientPhone,
        LocalDate unloadDate,
        String driverPhone) {

    /** 기존 테스트·호출자 호환용 생성자. 수신번호는 미지정한다. */
    public OutboundSlipDto(String slipNo, String partnerCode, String partnerName,
                           LocalDate slipDate, LocalDateTime scheduledAt,
                           String deliveryAddress, List<OutboundSlipLineDto> lines) {
        this(slipNo, partnerCode, partnerName, slipDate, scheduledAt, deliveryAddress, lines,
                null, null, null);
    }

    /** 기존 호출자 호환용 생성자. 하차일·배송기사 연락처는 미지정한다. */
    public OutboundSlipDto(String slipNo, String partnerCode, String partnerName,
                           LocalDate slipDate, LocalDateTime scheduledAt,
                           String deliveryAddress, List<OutboundSlipLineDto> lines,
                           String recipientPhone) {
        this(slipNo, partnerCode, partnerName, slipDate, scheduledAt, deliveryAddress, lines,
                recipientPhone, null, null);
    }

    /**
     * 라인 단건 — 품목명 + 수량.
     *
     * @param productName 품목명 (사용자 노출)
     * @param quantity 수량 (정수)
     */
    public record OutboundSlipLineDto(String productName, int quantity) {
    }
}
