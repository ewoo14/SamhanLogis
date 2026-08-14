package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * slip-service 의 출고/입고전표 line read-only snapshot DTO.
 * accounting-service 가 매출/입고전표 생성 시 검증/매핑용으로 조회.
 *
 * <p>slip-service 측 동일 시그니처 record 와 JSON deserialization 호환.
 *
 * <p>필드 매핑:
 * <ul>
 *   <li>{@code quantity} — SlipLine.quantity (int)</li>
 *   <li>{@code unitPrice} — SlipLine.unitPriceWithVat (VAT 포함 단가)</li>
 *   <li>{@code lineTotal} — quantity × unitPriceWithVat (VAT 포함 합)</li>
 *   <li>{@code partnerId} — 원천 전표 헤더 거래처 UUID (구 producer 응답에서는 null 가능)</li>
 *   <li>{@code partnerCode}/{@code partnerName} — 원천 전표 헤더 거래처 snapshot</li>
 *   <li>{@code slipType} — Slip.slipType.name() — 매출=OUTBOUND, 매입=INBOUND 만 source 가능</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SlipLineSnapshot(
        UUID slipId,
        String slipNo,
        UUID lineId,
        UUID partnerId,
        String partnerCode,
        String partnerName,
        String productName,
        String modelName,
        UUID sourceOrderLineId,
        String categoryKey,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String slipStatus,       // CONFIRMED 만 매출/입고전표 source 사용 가능
        String slipType
) {
    /** 기존 12필드 소비자와의 JSON/테스트 호환 생성자. */
    public SlipLineSnapshot(UUID slipId, String slipNo, UUID lineId, UUID partnerId,
                            String partnerCode, String partnerName, String productName,
                            int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                            String slipStatus, String slipType) {
        this(slipId, slipNo, lineId, partnerId, partnerCode, partnerName, productName,
                null, null, null, quantity, unitPrice, lineTotal, slipStatus, slipType);
    }
}
