package com.samhanair.logis.slip.revertability;

import java.util.List;

/** 되돌림을 실행하지 않고 가능 여부와 사용자 사유만 전달하는 결과. */
public record RevertabilityDecision(
        String slipNo,
        boolean revertable,
        List<RevertabilityReason> reasonCodes,
        List<String> reasons) {

    public RevertabilityDecision {
        reasonCodes = List.copyOf(reasonCodes);
        reasons = List.copyOf(reasons);
    }

    public String userVisibleText() {
        return reasons.isEmpty() ? "현재 되돌림 가능" : String.join(" ", reasons);
    }
}
