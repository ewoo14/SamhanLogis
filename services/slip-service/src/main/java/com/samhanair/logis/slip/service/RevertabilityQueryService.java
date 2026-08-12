package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.InventoryRevertabilityClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupSlipRepository;
import com.samhanair.logis.slip.revertability.RevertabilityDecision;
import com.samhanair.logis.slip.revertability.RevertabilityDecisionService;
import com.samhanair.logis.slip.revertability.RevertabilityEvidence;
import java.util.UUID;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 전표와 재고·배차 연결을 읽어 되돌림 판정만 수행한다. */
@Service
@RequiredArgsConstructor
public class RevertabilityQueryService {
    private final SlipRepository slipRepository;
    private final DispatchGroupSlipRepository groupSlipRepository;
    private final DispatchGroupRepository groupRepository;
    private final InventoryRevertabilityClient inventoryClient;
    private final RevertabilityDecisionService decisionService;

    @Transactional(readOnly = true)
    public RevertabilityDecision evaluate(UUID slipId) {
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다."));
        InventoryRevertabilityClient.Evidence inventory = inventoryClient.read(slipId, slip.getSlipNo());
        String groupNo = groupSlipRepository.findFirstBySlipIdAndIsDeletedFalse(slipId)
                .flatMap(mapping -> groupRepository.findById(mapping.getGroupId()))
                .map(group -> group.getGroupNo())
                .orElse(null);
        return decisionService.evaluate(new RevertabilityEvidence(slip.getSlipNo(), slip.getStatus(),
                inventory.inventoryResultCount(), inventory.sourceJournalCount(), groupNo));
    }

    /** 활성 검수완료 전표를 한 번에 판정한다. 실행·상태 변경은 하지 않는다. */
    @Transactional(readOnly = true)
    public List<RevertabilityDecision> evaluateCompleted() {
        return slipRepository.findAllByStatusAndIsDeletedFalse(
                        com.samhanair.logis.slip.domain.SlipStatus.COMPLETED, PageRequest.of(0, 100))
                .getContent().stream().map(slip -> evaluate(slip.getId())).toList();
    }
}
