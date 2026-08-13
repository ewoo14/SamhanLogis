package com.samhanair.logis.slip.revertability;

/** 사용자에게 설명할 수 있는 읽기 전용 되돌림 판정 차단 사유. */
public enum RevertabilityReason {
    NOT_COMPLETED("검수완료 상태가 아닙니다."),
    INVENTORY_RESULT_MISSING("연결된 재고 결과물을 확인할 수 없습니다."),
    LEGACY_NO_SOURCE_JOURNAL("재고 결과물은 연결됐지만 source journal이 없어 자동 되돌림 근거가 없습니다."),
    DOWNSTREAM_DISPATCH_GROUP("완료 후 연결된 배차그룹이 있어 먼저 연결을 해제해야 합니다.");

    private final String label;

    RevertabilityReason(String label) { this.label = label; }

    public String label() { return label; }
}
