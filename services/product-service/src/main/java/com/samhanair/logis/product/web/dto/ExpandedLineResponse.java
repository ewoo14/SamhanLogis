package com.samhanair.logis.product.web.dto;

import java.math.BigDecimal;

/**
 * 세트 전개 결과 라인 (internal) — slip-service 가 견적/전표 라인으로 영속.
 *
 * @param modelCode     구성품(또는 단일/KEEP 부모) modelCode
 * @param name          품목명(snapshot)
 * @param quantity      수량(FOLLOW_SET = setQty×구성품수량)
 * @param unitPrice     단가(싱글세트는 6:4 재배분, 상업/단일은 개별)
 * @param componentKind INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT (단일/KEEP 은 null)
 * @param setHead       전개된 세트의 첫 구성품 라인 여부(전표 그룹 헤더 표시용). 단일/KEEP 은 false
 */
public record ExpandedLineResponse(
        String modelCode,
        String name,
        BigDecimal quantity,
        BigDecimal unitPrice,
        String componentKind,
        boolean setHead) {
}
