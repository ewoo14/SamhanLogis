package com.samhanair.logis.slip.revertability;

import com.samhanair.logis.slip.domain.SlipStatus;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/** 검수완료 전표의 되돌림 가능성만 판정한다. 이 서비스에는 상태/재고 변경 경로가 없다. */
@Service
public class RevertabilityDecisionService {

    public RevertabilityDecision evaluate(RevertabilityEvidence evidence) {
        List<RevertabilityReason> codes = new ArrayList<>();
        List<String> reasons = new ArrayList<>();
        if (evidence.status() != SlipStatus.COMPLETED) {
            add(codes, reasons, RevertabilityReason.NOT_COMPLETED);
        } else if (evidence.inventoryResultCount() <= 0) {
            add(codes, reasons, RevertabilityReason.INVENTORY_RESULT_MISSING);
        } else if (evidence.sourceJournalCount() <= 0) {
            add(codes, reasons, RevertabilityReason.LEGACY_NO_SOURCE_JOURNAL);
        }
        if (evidence.activeDispatchGroupNo() != null && !evidence.activeDispatchGroupNo().isBlank()) {
            codes.add(RevertabilityReason.DOWNSTREAM_DISPATCH_GROUP);
            reasons.add(RevertabilityReason.DOWNSTREAM_DISPATCH_GROUP.label()
                    + " 배차그룹: " + evidence.activeDispatchGroupNo());
        }
        return new RevertabilityDecision(evidence.slipNo(), codes.isEmpty(), codes, reasons);
    }

    public List<RevertabilityDecision> evaluateAll(List<RevertabilityEvidence> evidence) {
        return evidence.stream().map(this::evaluate).toList();
    }

    private static void add(List<RevertabilityReason> codes, List<String> reasons, RevertabilityReason reason) {
        codes.add(reason);
        reasons.add(reason.label());
    }
}
