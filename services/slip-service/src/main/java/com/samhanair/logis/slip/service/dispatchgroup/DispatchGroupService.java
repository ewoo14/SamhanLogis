package com.samhanair.logis.slip.service.dispatchgroup;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroupSlip;
import com.samhanair.logis.slip.client.ArologisDispatchGroupClient;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupTransferRequest;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DispatchGroupService {
    private final DispatchGroupRepository groupRepository;
    private final DispatchGroupSlipRepository groupSlipRepository;
    private final CarrierService carrierService;
    private final SlipRepository slipRepository;
    private final ArologisDispatchGroupClient arologisClient;

    @Transactional(readOnly = true)
    public List<DispatchGroupResponse> list(java.time.LocalDate date) {
        return groupRepository.findAllByDispatchDateAndIsDeletedFalseOrderByGroupNoAsc(date).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public DispatchGroupResponse get(String groupNo) { return response(load(groupNo)); }

    @Transactional
    public DispatchGroupResponse create(DispatchGroupRequests.Create request) {
        if (groupRepository.existsByGroupNoAndIsDeletedFalse(request.groupNo()))
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 그룹 번호입니다.");
        DispatchGroup group = DispatchGroup.create(request.groupNo(), request.dispatchDate(), request.vehicleLabel());
        if (request.carrierCode() != null) group.assignCarrier(carrierService.load(request.carrierCode()));
        return response(groupRepository.save(group));
    }

    @Transactional
    public DispatchGroupResponse update(String groupNo, DispatchGroupRequests.Update request) {
        DispatchGroup group = load(groupNo);
        group.update(request.dispatchDate(), request.vehicleLabel());
        return response(group);
    }

    @Transactional
    public void delete(String groupNo, String actor) {
        DispatchGroup group = load(groupNo);
        ensureMutable(group, "삭제");
        String who = actor == null ? "system" : actor;
        groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId()).forEach(m -> m.markDeleted(who));
        group.markDeleted(who);
    }

    @Transactional
    public DispatchGroupResponse assignCarrier(String groupNo, String carrierCode) {
        DispatchGroup group = load(groupNo);
        ensureMutable(group, "운송사 변경");
        group.assignCarrier(carrierService.load(carrierCode));
        return response(group);
    }

    @Transactional
    public DispatchGroupResponse clearCarrier(String groupNo) { DispatchGroup group = load(groupNo); ensureMutable(group, "운송사 변경"); group.clearCarrier(); return response(group); }

    @Transactional
    public DispatchGroupResponse addSlip(String groupNo, DispatchGroupRequests.AddSlip request) {
        DispatchGroup group = load(groupNo);
        ensureMutable(group, "전표 편입");
        Slip slip = slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(
                SlipType.valueOf(request.inclusionType().name()), request.slipNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "활성 전표를 찾을 수 없습니다."));
        if (groupSlipRepository.existsBySlipIdAndIsDeletedFalse(slip.getId()))
            throw new BusinessException(ErrorCode.CONFLICT, "전표가 이미 다른 활성 배차 그룹에 담겨 있습니다.");
        int next = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId()).size() + 1;
        groupSlipRepository.save(DispatchGroupSlip.create(group.getId(), slip.getId(), request.inclusionType(), next));
        return response(group);
    }

    @Transactional
    public DispatchGroupResponse removeSlip(String groupNo, String slipNo, String actor) {
        DispatchGroup group = load(groupNo);
        ensureMutable(group, "현장 변경");
        DispatchGroupSlip mapping = findMapping(group.getId(), slipNo);
        mapping.markDeleted(actor == null ? "system" : actor);
        return response(group);
    }

    @Transactional
    public DispatchGroupResponse reorder(String groupNo, DispatchGroupRequests.Reorder request) {
        DispatchGroup group = load(groupNo);
        ensureMutable(group, "현장 변경");
        List<DispatchGroupSlip> mappings = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
        Map<String, DispatchGroupSlip> byNo = new HashMap<>();
        for (DispatchGroupSlip mapping : mappings) slipRepository.findById(mapping.getSlipId()).ifPresent(s -> byNo.put(s.getSlipNo(), mapping));
        if (request.slipNos().size() != mappings.size() || !byNo.keySet().equals(new java.util.HashSet<>(request.slipNos())))
            throw new BusinessException(ErrorCode.INVALID_INPUT, "그룹의 전체 전표번호를 순서대로 보내야 합니다.");
        int sequence = 1;
        for (String slipNo : request.slipNos()) byNo.get(slipNo).updateSequence(sequence++);
        return response(group);
    }

    @Transactional(noRollbackFor = BusinessException.class)
    public DispatchGroupResponse transfer(String groupNo) {
        DispatchGroup group = load(groupNo);
        var carrier = group.getCarrierId() == null ? null : carrierService.loadInternal(group.getCarrierId());
        var mappings = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
        if (carrier == null || !carrier.isActive() || !carrier.isArologis() || mappings.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT, "아로로지스 운송사가 지정된 전표 포함 그룹만 전송할 수 있습니다.");
        }
        if (group.getTransferStatus() == com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus.SENT)
            return response(group);
        var slips = mappings.stream().map(m -> {
            Slip s = slipRepository.findById(m.getSlipId()).orElseThrow();
            return new DispatchGroupTransferRequest.Slip(s.getSlipNo(), m.getInclusionType().name(), m.getSequence(),
                    s.getPartnerCode(), s.getPartnerName(), s.getDeliveryAddress());
        }).toList();
        DispatchGroupTransferRequest request = new DispatchGroupTransferRequest(group.getGroupNo(),
                group.getDispatchDate(), group.getVehicleLabel(), carrier.getCode(), carrier.getName(), slips);
        try {
            sendWithOneImmediateRetry(request);
            group.markTransferSent();
        } catch (RuntimeException ex) {
            // 원격 upsert가 이미 커밋됐을 수 있으므로 FAILED로 확정하지 않는다.
            // PENDING은 같은 멱등 요청을 scheduler가 재확인할 때까지 그룹과 운송사 수정을 잠근다.
            group.markTransferPending();
            throw new BusinessException(ErrorCode.CONFLICT,
                    "아로로지스 전송 결과 확인 중입니다. 같은 그룹은 중복 없이 자동 재확인됩니다.");
        }
        return response(group);
    }

    /** 응답 유실의 흔한 일시 경로를 즉시 한 번 재확인한다. 수신 endpoint는 groupNo 기준 upsert다. */
    private void sendWithOneImmediateRetry(DispatchGroupTransferRequest request) {
        try {
            arologisClient.send(request);
        } catch (RuntimeException firstFailure) {
            try {
                arologisClient.send(request);
            } catch (RuntimeException secondFailure) {
                secondFailure.addSuppressed(firstFailure);
                throw secondFailure;
            }
        }
    }

    /** 두 번의 동기 확인도 결과를 받지 못한 PENDING 그룹을 멱등 재전송해 최종 SENT로 수렴시킨다. */
    @Scheduled(fixedDelayString = "${samhan.dispatch-group.transfer-retry-delay-ms:30000}")
    @Transactional(noRollbackFor = BusinessException.class)
    public void retryPendingTransfers() {
        groupRepository.findAllByTransferStatusAndIsDeletedFalseOrderByModifiedAtAsc(
                        com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus.PENDING,
                        PageRequest.of(0, 100))
                .forEach(group -> {
                    try {
                        transfer(group.getGroupNo());
                    } catch (RuntimeException ex) {
                        log.warn("아로로지스 전송 결과 재확인 대기 — groupNo={} reason={}",
                                group.getGroupNo(), ex.getMessage());
                    }
                });
    }

    public boolean hasActiveReference(UUID slipId) { return groupSlipRepository.existsBySlipIdAndIsDeletedFalse(slipId); }
    private void ensureMutable(DispatchGroup group, String action) {
        if (group.getTransferStatus() == com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus.SENT)
            throw new BusinessException(ErrorCode.CONFLICT, "아로로지스 전송 완료 그룹은 " + action + "할 수 없습니다.");
        if (group.getTransferStatus() == com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus.PENDING)
            throw new BusinessException(ErrorCode.CONFLICT, "아로로지스 전송 결과 확인 중인 그룹은 " + action + "할 수 없습니다.");
    }
    public DispatchGroup load(String groupNo) { return groupRepository.findByGroupNoAndIsDeletedFalse(groupNo)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "배차 그룹을 찾을 수 없습니다.")); }

    private DispatchGroupSlip findMapping(UUID groupId, String slipNo) {
        Slip slip = slipRepository.findBySlipNo(slipNo).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다."));
        return groupSlipRepository.findByGroupIdAndSlipIdAndIsDeletedFalse(groupId, slip.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "그룹에 담긴 전표를 찾을 수 없습니다."));
    }

    private DispatchGroupResponse response(DispatchGroup group) {
        var carrier = group.getCarrierId() == null ? null : carrierService.loadInternal(group.getCarrierId());
        List<DispatchGroupSlip> mappings = groupSlipRepository.findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId());
        Map<UUID, String> slipNos = new HashMap<>();
        mappings.forEach(m -> slipRepository.findById(m.getSlipId()).ifPresent(s -> slipNos.put(m.getSlipId(), s.getSlipNo())));
        return DispatchGroupResponse.from(group, carrier == null ? null : carrier.getCode(), carrier == null ? null : carrier.getName(),
                carrier == null ? null : carrier.isArologis(), mappings, slipNos);
    }
}
