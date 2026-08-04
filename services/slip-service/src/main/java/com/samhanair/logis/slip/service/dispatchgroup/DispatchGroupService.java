package com.samhanair.logis.slip.service.dispatchgroup;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroupSlip;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupSlipRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DispatchGroupService {
    private final DispatchGroupRepository groupRepository;
    private final DispatchGroupSlipRepository groupSlipRepository;
    private final CarrierService carrierService;
    private final SlipRepository slipRepository;

    @Transactional(readOnly = true)
    public List<DispatchGroupResponse> list(java.time.LocalDate date) {
        return groupRepository.findAllByDispatchDateAndIsDeletedFalseOrderByGroupNoAsc(date).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public DispatchGroupResponse get(UUID id) { return response(load(id)); }

    @Transactional
    public DispatchGroupResponse create(DispatchGroupRequests.Create request) {
        if (groupRepository.existsByGroupNoAndIsDeletedFalse(request.groupNo()))
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 그룹 번호입니다.");
        DispatchGroup group = DispatchGroup.create(request.groupNo(), request.dispatchDate(), request.vehicleLabel());
        if (request.carrierId() != null) group.assignCarrier(carrierService.load(request.carrierId()));
        return response(groupRepository.save(group));
    }

    @Transactional
    public DispatchGroupResponse update(UUID id, DispatchGroupRequests.Update request) {
        DispatchGroup group = load(id);
        group.update(request.dispatchDate(), request.vehicleLabel());
        return response(group);
    }

    @Transactional
    public void delete(UUID id, String actor) {
        DispatchGroup group = load(id);
        String who = actor == null ? "system" : actor;
        groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(id).forEach(m -> m.markDeleted(who));
        group.markDeleted(who);
    }

    @Transactional
    public DispatchGroupResponse assignCarrier(UUID id, UUID carrierId) {
        DispatchGroup group = load(id);
        group.assignCarrier(carrierService.load(carrierId));
        return response(group);
    }

    @Transactional
    public DispatchGroupResponse clearCarrier(UUID id) { DispatchGroup group = load(id); group.clearCarrier(); return response(group); }

    @Transactional
    public DispatchGroupResponse addSlip(UUID id, DispatchGroupRequests.AddSlip request) {
        DispatchGroup group = load(id);
        Slip slip = slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(
                SlipType.valueOf(request.inclusionType().name()), request.slipNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "활성 전표를 찾을 수 없습니다."));
        if (groupSlipRepository.existsBySlipIdAndIsDeletedFalse(slip.getId()))
            throw new BusinessException(ErrorCode.CONFLICT, "전표가 이미 다른 활성 배차 그룹에 담겨 있습니다.");
        int next = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(id).size() + 1;
        groupSlipRepository.save(DispatchGroupSlip.create(id, slip.getId(), request.inclusionType(), next));
        return response(group);
    }

    @Transactional
    public DispatchGroupResponse removeSlip(UUID id, String slipNo, String actor) {
        DispatchGroupSlip mapping = findMapping(id, slipNo);
        mapping.markDeleted(actor == null ? "system" : actor);
        return response(load(id));
    }

    @Transactional
    public DispatchGroupResponse reorder(UUID id, DispatchGroupRequests.Reorder request) {
        List<DispatchGroupSlip> mappings = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(id);
        Map<String, DispatchGroupSlip> byNo = new HashMap<>();
        for (DispatchGroupSlip mapping : mappings) slipRepository.findById(mapping.getSlipId()).ifPresent(s -> byNo.put(s.getSlipNo(), mapping));
        if (request.slipNos().size() != mappings.size() || !byNo.keySet().equals(new java.util.HashSet<>(request.slipNos())))
            throw new BusinessException(ErrorCode.INVALID_INPUT, "그룹의 전체 전표번호를 순서대로 보내야 합니다.");
        int sequence = 1;
        for (String slipNo : request.slipNos()) byNo.get(slipNo).updateSequence(sequence++);
        return response(load(id));
    }

    public boolean hasActiveReference(UUID slipId) { return groupSlipRepository.existsBySlipIdAndIsDeletedFalse(slipId); }
    public DispatchGroup load(UUID id) { return groupRepository.findByIdAndIsDeletedFalse(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "배차 그룹을 찾을 수 없습니다.")); }

    private DispatchGroupSlip findMapping(UUID groupId, String slipNo) {
        Slip slip = slipRepository.findBySlipNo(slipNo).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다."));
        return groupSlipRepository.findByGroupIdAndSlipIdAndIsDeletedFalse(groupId, slip.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "그룹에 담긴 전표를 찾을 수 없습니다."));
    }

    private DispatchGroupResponse response(DispatchGroup group) {
        var carrier = group.getCarrierId() == null ? null : carrierService.load(group.getCarrierId());
        List<DispatchGroupSlip> mappings = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
        Map<UUID, String> slipNos = new HashMap<>();
        mappings.forEach(m -> slipRepository.findById(m.getSlipId()).ifPresent(s -> slipNos.put(m.getSlipId(), s.getSlipNo())));
        return DispatchGroupResponse.from(group, carrier == null ? null : carrier.getCode(), carrier == null ? null : carrier.getName(),
                carrier == null ? null : carrier.isArologis(), mappings, slipNos);
    }
}
