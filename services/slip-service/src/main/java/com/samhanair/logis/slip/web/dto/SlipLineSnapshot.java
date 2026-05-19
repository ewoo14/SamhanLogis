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
 *   <li>{@code slipStatus} — Slip.status.name() — CONFIRMED 만 매출전표 source 가능</li>
 * </ul>
 */
public record SlipLineSnapshot(
        UUID slipId,
        String slipNo,
        UUID lineId,
        String productName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String slipStatus
) {}
