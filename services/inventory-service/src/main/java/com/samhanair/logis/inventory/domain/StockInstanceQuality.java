package com.samhanair.logis.inventory.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 재고 인스턴스의 품질 축. 재고상황(StockInstanceStatus)과 독립적으로 저장한다. */
@Getter
@RequiredArgsConstructor
public enum StockInstanceQuality {
    /** 정상 품질 */
    NORMAL("정상"),
    /** 중고 품질 */
    USED("중고"),
    /** 파손 품질 */
    DAMAGED("파손"),
    /** 재포장 품질 */
    REPACKAGED("재포장"),
    /** 박스불량 품질 */
    BOX_DEFECT("박스불량");

    private final String displayName;
}
