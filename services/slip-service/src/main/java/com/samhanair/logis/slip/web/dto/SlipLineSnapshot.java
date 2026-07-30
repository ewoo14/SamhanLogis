package com.samhanair.logis.slip.web.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * 출고/입고전표 line read-only snapshot — accounting-service 등 외부 consumer 용.
 *
 * <p>본 record 와 accounting-service.client.SlipLineSnapshot 은 JSON 시그니처 호환.
 *
 * <p>필드 매핑 (SAS 표준 = VAT-inclusive 단가, 사용자 결정 2026-05-19):
 * <ul>
 *   <li>{@code quantity} — SlipLine.quantity (int)</li>
 *   <li>{@code unitPrice} — SlipLine.unitPriceWithVat (VAT 포함 단가)</li>
 *   <li>{@code lineTotal} — quantity × unitPriceWithVat (VAT 포함 합)</li>
 *   <li>{@code partnerId} — Slip.partnerId (원천 전표 헤더 거래처)</li>
 *   <li>{@code partnerCode}/{@code partnerName} — Slip 헤더 거래처 snapshot</li>
 *   <li>{@code slipStatus} — Slip.status.name() — CONFIRMED 만 매출/매입전표 source 가능</li>
 *   <li>{@code slipType} — Slip.slipType.name() — 매출=OUTBOUND, 매입=INBOUND 만 source 가능</li>
 * </ul>
 */
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
        String slipStatus,
        String slipType
) {}
