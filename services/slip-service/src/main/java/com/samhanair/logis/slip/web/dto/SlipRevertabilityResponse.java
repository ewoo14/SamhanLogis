package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.revertability.RevertabilityDecision;
import com.samhanair.logis.slip.revertability.RevertabilityReason;
import java.util.List;

/** 사용자 표시용 되돌림 가능성 결과. 내부 UUID 필드는 의도적으로 없다. */
public record SlipRevertabilityResponse(
        String slipNo,
        boolean revertable,
        List<RevertabilityReason> reasonCodes,
        List<String> reasons,
        String userVisibleText) {
    public static SlipRevertabilityResponse from(RevertabilityDecision decision) {
        return new SlipRevertabilityResponse(decision.slipNo(), decision.revertable(),
                decision.reasonCodes(), decision.reasons(), decision.userVisibleText());
    }
}
