package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * slip-service 의 출고전표 line read-only snapshot DTO.
 * accounting-service 가 매출전표 생성 시 검증/매핑용으로 조회.
 *
 * <p>slip-service 측 동일 시그니처 record 와 JSON deserialization 호환.
 *
 * <p>필드 매핑:
 * <ul>
 *   <li>{@code quantity} — SlipLine.quantity (int)</li>
 *   <li>{@code unitPrice} — SlipLine.unitPrice (VAT 미포함 단가)</li>
 *   <li>{@code lineTotal} — SlipLine.lineTotal (= quantity × unitPrice)</li>
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
        String slipStatus        // CONFIRMED 만 매출전표 source 사용 가능
) {}
