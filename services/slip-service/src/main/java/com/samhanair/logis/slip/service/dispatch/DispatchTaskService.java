package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchTonnage;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleBodyType;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Samhan Public 배차 작업 DRAFT 생명주기 — BE Task B6.
 *
 * <p>Daily counter 기반 taskCode 발급 ({@code YYYY/MM/DD-N}). UUID 비공개 가드.
 *
 * <p>책임 분리:
 * <ul>
 *   <li>{@link DispatchTaskService} — DRAFT 단계 CRUD (본 클래스)</li>
 *   <li>{@code DispatchTaskCompletionService} — DRAFT → DISPATCHING 전이 + arologis 발송 (B9)</li>
 *   <li>{@code DispatchTaskConfirmService} — arologis confirm 회신 처리 (B10)</li>
 *   <li>{@code DispatchTaskUnavailableService} — arologis unavailable 회신 처리 (B10)</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DispatchTaskService {

    private static final int MAX_DAILY_COUNTER = 99_999;
    private final DispatchTaskRepository taskRepo;
    private final DispatchVehicleGroupRepository groupRepo;
    private final DispatchVehicleGroupSlipRepository slipMapRepo;
    private final SlipRepository slipRepo;
    private final EntityManager entityManager;
    private final CollectionRealtimePublisher collectionPublisher;

    /** 신규 배차 작업 (DRAFT) 생성 — taskCode 자동 생성. */
    public DispatchTask createTask(LocalDate dispatchDate) {
        String code = generateTaskCode(dispatchDate);
        DispatchTask t = DispatchTask.create(code, dispatchDate);
        DispatchTask saved = taskRepo.save(t);
        log.info("DispatchTask 생성 — taskCode={} date={}", saved.getTaskCode(), saved.getDispatchDate());
        publishBoardChanged("CREATED");
        return saved;
    }

    /**
     * 배차 보드 재진입용 오늘 DRAFT 보장.
     *
     * <p>F5/메뉴 재진입 때마다 새 task 를 만들면 기존 task 에 묶인 전표가 cross-task 가드에 막힌다.
     * 같은 일자 채번 lock 안에서 최신 DRAFT 를 먼저 찾고, 없을 때만 새 회차를 생성한다.
     */
    public DispatchTask findOrCreateTodayDraft(LocalDate dispatchDate) {
        String prefix = dispatchDate.format(java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        lockNumberSeries("dispatch_task_seq_" + prefix);
        return taskRepo.findFirstByDispatchDateAndStatusAndIsDeletedFalseOrderByCreatedAtDesc(
                        dispatchDate, DispatchTaskStatus.DRAFT)
                .orElseGet(() -> createTask(dispatchDate));
    }

    /** 차량 그룹 추가 — sequence 는 자동 증가 (현재 그룹 개수 + 1). */
    public DispatchVehicleGroup addVehicleGroup(
            UUID dispatchTaskId,
            DispatchVehicleBodyType vehicleBodyType,
            DispatchTonnage tonnage
    ) {
        lockVehicleGroupSequence(dispatchTaskId);
        requireDraftTask(dispatchTaskId);
        int nextSeq = nextVehicleGroupSequence(dispatchTaskId);
        DispatchVehicleGroup g;
        try {
            g = DispatchVehicleGroup.create(dispatchTaskId, nextSeq, vehicleBodyType, tonnage);
        } catch (IllegalArgumentException ex) {
            // 사용자 입력 2축 matrix 오류는 서비스 경계에서 400 INVALID_INPUT 으로 변환한다.
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage(), ex);
        }
        DispatchVehicleGroup saved = groupRepo.save(g);
        publishBoardChanged("UPDATED");
        return saved;
    }

    /**
     * legacy enum 기반 차량 그룹 추가.
     *
     * <p>기존 테스트/fixture 코드 호환용이다. 사용자-facing 신규 API 는 차종/톤수 2축을 받는다.
     */
    public DispatchVehicleGroup addVehicleGroup(UUID dispatchTaskId, DispatchVehicleType vehicleType) {
        lockVehicleGroupSequence(dispatchTaskId);
        requireDraftTask(dispatchTaskId);
        int nextSeq = nextVehicleGroupSequence(dispatchTaskId);
        DispatchVehicleGroup g = DispatchVehicleGroup.create(dispatchTaskId, nextSeq, vehicleType);
        DispatchVehicleGroup saved = groupRepo.save(g);
        publishBoardChanged("UPDATED");
        return saved;
    }

    /** 차량 그룹 삭제 (soft-delete). 그룹의 slip 매핑도 cascade soft-delete. */
    public void removeVehicleGroup(UUID dispatchTaskId, UUID vehicleGroupId, String actor, String callerName) {
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹은 삭제할 수 없습니다.");
        }
        requireDraftTask(dispatchTaskId);
        String actorName = resolveActorName(callerName);
        // cascade 복원의 등호 매칭 기준 — 그룹과 하위 매핑 전체에 동일한 삭제 시각을 주입한다.
        LocalDateTime deletedAt = LocalDateTime.now();
        slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId)
                .forEach(m -> {
                    m.markDeletedWithName(actor, actorName, deletedAt);
                    slipMapRepo.save(m);
                });
        group.markDeletedWithName(actor, actorName, deletedAt);
        groupRepo.save(group);
        publishBoardChanged("DELETED");
    }

    /** slip 을 그룹에 추가 — sequence 자동 증가 (현재 group 내 slip 개수 + 1). */
    public DispatchVehicleGroupSlip assignSlip(UUID dispatchTaskId, UUID vehicleGroupId, UUID slipId) {
        lockSlipAssignment(slipId);
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹에는 전표를 추가할 수 없습니다.");
        }
        requireDraftTask(dispatchTaskId);
        Slip slip = slipRepo.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "slip 이 존재하지 않습니다: " + slipId));
        if (slip.getDispatchStatus() != SlipDispatchStatus.UNDISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "미배차 전표만 배차 그룹에 추가할 수 있습니다: " + slip.getDispatchStatus().getDisplayName());
        }
        for (DispatchVehicleGroupSlip existing : slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)) {
            if (existing.getVehicleGroupId().equals(vehicleGroupId)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 같은 차량 그룹에 추가된 전표입니다.");
            }
            DispatchVehicleGroup existingGroup = findGroupOrThrow(existing.getVehicleGroupId());
            if (!existingGroup.getDispatchTaskId().equals(dispatchTaskId)) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 다른 배차 작업에 추가된 전표입니다.");
            }
        }
        int nextSeq = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId).size() + 1;
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(vehicleGroupId, slipId, nextSeq);
        DispatchVehicleGroupSlip saved = slipMapRepo.save(mapping);
        publishBoardChanged("UPDATED");
        return saved;
    }

    /** 그룹 내 slip 순서 재정렬 — orderedSlipIds 순서대로 sequence 1, 2, 3... 갱신. */
    public void reorderSlips(UUID vehicleGroupId, List<UUID> orderedSlipIds) {
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹의 전표 순서는 변경할 수 없습니다.");
        }
        requireDraftTask(group.getDispatchTaskId());
        var mappings = slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId);
        Map<UUID, DispatchVehicleGroupSlip> bySlipId = new HashMap<>();
        for (DispatchVehicleGroupSlip m : mappings) {
            bySlipId.put(m.getSlipId(), m);
        }
        for (int i = 0; i < orderedSlipIds.size(); i++) {
            DispatchVehicleGroupSlip m = bySlipId.get(orderedSlipIds.get(i));
            if (m == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "재정렬에 포함된 slip 이 그룹에 존재하지 않습니다: " + orderedSlipIds.get(i));
            }
            m.updateSequence(i + 1);
        }
        slipMapRepo.saveAll(mappings);
        publishBoardChanged("UPDATED");
    }

    /** 그룹에서 slip 제거 (soft-delete). */
    public void removeSlipFromGroup(UUID vehicleGroupId, UUID slipId, String actor, String callerName) {
        DispatchVehicleGroup group = findGroupOrThrow(vehicleGroupId);
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹의 전표는 제거할 수 없습니다.");
        }
        requireDraftTask(group.getDispatchTaskId());
        String actorName = resolveActorName(callerName);
        DispatchVehicleGroupSlip mapping = slipMapRepo
                .findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId)
                .stream()
                .filter(m -> m.getSlipId().equals(slipId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "그룹에 매핑된 slip 이 없습니다."));
        mapping.markDeletedWithName(actor, actorName);
        slipMapRepo.save(mapping);
        publishBoardChanged("DELETED");
    }

    /**
     * 삭제된 차량 그룹을 복원하고, 같은 그룹 삭제 cascade 로 삭제된 하위 전표 매핑도 함께 복원한다.
     *
     * <p>{@link DispatchVehicleGroup} / {@link DispatchVehicleGroupSlip} 은
     * {@code @SQLRestriction("is_deleted = false")} 로 삭제행이 일반 조회에서 빠진다. 복원 대상은
     * native IncludingDeleted 조회로 먼저 로드해야 한다.
     *
     * <p>cascade 집합은 {@code removeVehicleGroup} 이 주입한 공유 삭제 시각의 등호 매칭으로 확정한다.
     * 삭제(취소선) 기간 동안 다른 그룹/작업에 재배정되었거나 발송 상태가 바뀐 전표는
     * {@link #isMappingRestorable(DispatchVehicleGroupSlip)} 가드로 복원에서 제외한다(이중 배차 방지).
     *
     * @param dispatchTaskId 배차 작업 UUID
     * @param vehicleGroupId 차량 그룹 UUID
     * @param actor 복원 주체 userId
     * @param callerName 복원 주체 표시명 원본 (UUID 형태면 저장하지 않음)
     */
    public void restoreVehicleGroup(UUID dispatchTaskId, UUID vehicleGroupId, String actor, String callerName) {
        // 락 획득 이후에 그룹을 조회한다 — 동시 복원(더블클릭/재시도)에서 먼저 커밋된 복원을 반영한
        // fresh 스냅샷으로 isDeleted 를 확인해야 조기 return(멱등)을 놓치지 않는다(락 전 조회 시
        // stale isDeleted=true 로 2차 요청이 순번을 불필요하게 밀고 RESTORED 를 중복 발화).
        // restoreSlipFromGroup 이 락 이후 매핑을 조회하는 것과 동일 순서.
        lockVehicleGroupSequence(dispatchTaskId);
        DispatchVehicleGroup group = groupRepo.findByIdIncludingDeleted(vehicleGroupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchVehicleGroup 이 존재하지 않습니다: " + vehicleGroupId));
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        requireDraftTask(dispatchTaskId);
        if (!Boolean.TRUE.equals(group.getIsDeleted())) {
            return;
        }
        // 결함계열 일관 — 발송(부분발송 포함) 그룹 mutation 차단(removeVehicleGroup·restoreSlipFromGroup 동일 가드).
        // removeVehicleGroup 이 DISPATCHED 그룹 삭제를 막아 fresh 데이터엔 도달불가하나, 발송완료 그룹이
        // 복원으로 편집 컨텍스트에 재진입하지 않도록 방어한다(레거시/경합 안전).
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹은 복원할 수 없습니다.");
        }

        // (dispatch_task_id, sequence) 활성 partial unique 방어 — 삭제 후 추가된 그룹이 빈 sequence 를
        // 재사용했으면(addVehicleGroup 은 활성 수 + 1 채번) 복원 그룹을 말번으로 재부여한다.
        List<DispatchVehicleGroup> activeGroups =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(dispatchTaskId);
        boolean sequenceTaken = activeGroups.stream()
                .anyMatch(active -> active.getSequence() == group.getSequence());
        if (sequenceTaken) {
            int nextSeq = activeGroups.stream()
                    .mapToInt(DispatchVehicleGroup::getSequence)
                    .max()
                    .orElse(0) + 1;
            group.reassignSequence(nextSeq);
        }

        LocalDateTime deletedAt = group.getDeletedAt();
        String deletedBy = group.getDeletedBy();
        String actorName = resolveActorName(callerName);
        List<DispatchVehicleGroupSlip> cascadeMappings = deletedAt == null || deletedBy == null
                ? List.of()
                : slipMapRepo.findDeletedCascadeMappings(vehicleGroupId, deletedBy, deletedAt);
        cascadeMappings.stream()
                .map(DispatchVehicleGroupSlip::getSlipId)
                .distinct()
                .sorted()
                .forEach(this::lockSlipAssignment);
        List<DispatchVehicleGroupSlip> restorable = cascadeMappings.stream()
                .filter(this::isMappingRestorable)
                .toList();

        group.markRestoredWithNameCleared();
        restorable.forEach(DispatchVehicleGroupSlip::markRestoredWithNameCleared);
        groupRepo.save(group);
        slipMapRepo.saveAll(restorable);
        log.info("배차 차량 그룹 복원 — taskId={} groupId={} actor={} actorName={} cascade복원={} 제외={}",
                dispatchTaskId, vehicleGroupId, actor, actorName, restorable.size(),
                cascadeMappings.size() - restorable.size());
        publishBoardChanged("RESTORED");
    }

    /**
     * 삭제된 그룹-전표 매핑 1건을 복원한다.
     *
     * <p>삭제된 매핑은 {@code @SQLRestriction} 컬렉션으로는 보이지 않으므로 native IncludingDeleted
     * 조회를 사용한다. 삭제 기간 동안 전표가 재배정/발송되었으면 부활 시
     * {@code (vehicle_group_id, slip_id)} 활성 unique 위반·이중 배차가 되므로 409 로 차단한다.
     *
     * @param dispatchTaskId 배차 작업 UUID (그룹 소속 검증)
     * @param vehicleGroupId 차량 그룹 UUID
     * @param slipId 전표 UUID
     * @param actor 복원 주체 userId
     * @param callerName 복원 주체 표시명 원본 (UUID 형태면 저장하지 않음)
     */
    public void restoreSlipFromGroup(UUID dispatchTaskId, UUID vehicleGroupId, UUID slipId,
                                     UUID mappingId, String actor, String callerName) {
        DispatchVehicleGroup group = groupRepo.findByIdIncludingDeleted(vehicleGroupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchVehicleGroup 이 존재하지 않습니다: " + vehicleGroupId));
        if (!group.getDispatchTaskId().equals(dispatchTaskId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "group 이 task 에 속하지 않습니다.");
        }
        if (Boolean.TRUE.equals(group.getIsDeleted())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "삭제된 차량 그룹의 전표는 그룹 복원으로만 복원할 수 있습니다.");
        }
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹의 전표는 복원할 수 없습니다.");
        }
        lockSlipAssignment(slipId);
        requireDraftTask(dispatchTaskId);
        DispatchVehicleGroupSlip mapping = resolveRestoreTargetMapping(vehicleGroupId, slipId, mappingId);
        if (!Boolean.TRUE.equals(mapping.getIsDeleted())) {
            return;
        }
        if (!slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId).isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 활성 배차 매핑이 있는 전표입니다 — 기존 매핑을 제거한 뒤 복원하세요.");
        }
        Slip slip = slipRepo.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "slip 이 존재하지 않습니다: " + slipId));
        if (slip.getDispatchStatus() != SlipDispatchStatus.UNDISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "미배차 전표만 복원할 수 있습니다: " + slip.getDispatchStatus().getDisplayName());
        }
        String actorName = resolveActorName(callerName);
        mapping.markRestoredWithNameCleared();
        slipMapRepo.save(mapping);
        log.info("배차 그룹 전표 매핑 복원 — groupId={} slipId={} actor={} actorName={}",
                vehicleGroupId, slipId, actor, actorName);
        publishBoardChanged("RESTORED");
    }

    /**
     * 복원 대상 매핑을 확정한다.
     *
     * <p>같은 (그룹,전표)에 삭제 tombstone 이 여러 건이면(제거→재추가→재제거) slipId 만으로는 어느
     * 행을 복원할지 모호하다. 상세 응답이 노출하는 매핑 id 를 {@code mappingId} 로 받아 특정 행을
     * 지정한다(그룹/전표 소속 검증). mappingId 미지정(하위호환)이면 단건 tombstone 을 복원하고,
     * 후보가 2건 이상이면 임의 복원 대신 409 로 상세 행 복원을 안내한다(UI 는 항상 mappingId 를 보냄).
     */
    private DispatchVehicleGroupSlip resolveRestoreTargetMapping(UUID vehicleGroupId, UUID slipId,
                                                                 UUID mappingId) {
        if (mappingId != null) {
            // mappingId 가 지정 그룹/전표에 속하지 않으면(미존재 또는 타 그룹) IDOR 안전하게 fallback 과
            // 동일한 "그룹에 매핑된 slip 이 없습니다"(NOT_FOUND)로 통일 — 타 그룹 존재 여부를 누설하지 않는다.
            DispatchVehicleGroupSlip mapping = slipMapRepo.findByIdIncludingDeleted(mappingId).orElse(null);
            if (mapping == null
                    || !mapping.getVehicleGroupId().equals(vehicleGroupId)
                    || !mapping.getSlipId().equals(slipId)) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "그룹에 매핑된 slip 이 없습니다.");
            }
            return mapping;
        }
        List<DispatchVehicleGroupSlip> deletedCandidates =
                slipMapRepo.findDeletedByVehicleGroupIdAndSlipId(vehicleGroupId, slipId);
        if (deletedCandidates.size() > 1) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "삭제된 전표 매핑이 여러 건입니다 — 상세 행의 복원 버튼으로 복원하세요.");
        }
        return deletedCandidates.isEmpty()
                ? slipMapRepo.findByVehicleGroupIdAndSlipIdIncludingDeleted(vehicleGroupId, slipId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "그룹에 매핑된 slip 이 없습니다."))
                : deletedCandidates.get(0);
    }

    /**
     * cascade 복원 대상 매핑이 {@code assignSlip} 불변식(활성 매핑 없음·미배차 전표)을 여전히
     * 만족하는지 판정한다.
     *
     * <p>취소선 기간 동안 전표가 다른 그룹/작업에 재배정되었거나 발송되었을 수 있다 — 그대로
     * 부활시키면 이중 배차·활성 unique 위반이 되므로 복원에서 제외한다(취소선 행은 잔존하며,
     * 단건 복원 시도 시 409 로 사유를 안내한다).
     */
    private boolean isMappingRestorable(DispatchVehicleGroupSlip mapping) {
        if (!slipMapRepo.findBySlipIdAndIsDeletedFalse(mapping.getSlipId()).isEmpty()) {
            return false;
        }
        Slip slip = slipRepo.findById(mapping.getSlipId()).orElse(null);
        return slip != null && slip.getDispatchStatus() == SlipDispatchStatus.UNDISPATCHED;
    }

    /**
     * 차량 그룹 sequence 신규 채번.
     *
     * <p>삭제행 영구 보존 이후 활성 sequence 는 중간이 비어 있을 수 있다. 활성 개수+1 은
     * {@code 1,3 -> 3} 처럼 기존 활성 row 와 충돌하므로 항상 활성 max+1 을 사용한다.
     */
    private int nextVehicleGroupSequence(UUID dispatchTaskId) {
        return groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(dispatchTaskId)
                .stream()
                .mapToInt(DispatchVehicleGroup::getSequence)
                .max()
                .orElse(0) + 1;
    }

    private void lockVehicleGroupSequence(UUID dispatchTaskId) {
        lockNumberSeries("dispatch_group_seq_" + dispatchTaskId);
    }

    private void lockSlipAssignment(UUID slipId) {
        lockNumberSeries("dispatch_slip_assign_" + slipId);
    }

    /** 배차 목록 변경 발화 (커밋 후). changeType = CREATED/UPDATED/DELETED/STATUS_CHANGED/RESTORED. */
    private void publishBoardChanged(String changeType) {
        collectionPublisher.publishChange(
                DispatchBoardRealtime.CHANNEL_ID,
                DispatchBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }

    /**
     * Daily counter 기반 taskCode 발급 — YYYY/MM/DD-N. 배차 메뉴 안에서만 유일하면 된다.
     *
     * <p>D-LOAD-04 fix5: 기존 first-missing probe 는 병렬 DRAFT 생성 시 같은 빈 번호를 동시에
     * 발견할 수 있다. 같은 일자 prefix 에 transaction advisory lock 을 잡은 뒤 probe 를 수행해
     * 번호 선택과 INSERT 를 {@link #createTask(LocalDate)} 트랜잭션 안에서 직렬화한다.
     *
     * <p>#725 판정: 아래 {@link IllegalStateException} 은 하루 {@code MAX_DAILY_COUNTER}(99,999)건의
     * 배차 작업 채번 소진이라는 내부 불변식(프로그래밍/용량 방어) 위반이며 사용자 액션으로 유발되는
     * 상태전이 위반이 아니다 — 정상 운영 중 사용자가 하루에 이 건수만큼 배차를 생성하는 것은
     * 사실상 불가능하므로 BusinessException 승격 대상에서 제외하고 genuine 500 을 유지한다.
     */
    private String generateTaskCode(LocalDate date) {
        String prefix = date.format(java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        lockNumberSeries("dispatch_task_seq_" + prefix);
        for (int n = 1; n <= MAX_DAILY_COUNTER; n++) {
            String code = prefix + "-" + n;
            if (!taskRepo.existsByTaskCodeAndIsDeletedFalse(code)) {
                return code;
            }
        }
        throw new IllegalStateException("일 배차 작업 카운터 초과 (>" + MAX_DAILY_COUNTER + ")");
    }

    /**
     * PostgreSQL transaction advisory lock 으로 일자별 배차 taskCode 채번 구간을 직렬화한다.
     *
     * @param key 채번 계열 lock key
     */
    private void lockNumberSeries(String key) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))")
                .setParameter(1, key)
                .getSingleResult();
    }

    private DispatchTask findTaskOrThrow(UUID id) {
        return taskRepo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchTask 가 존재하지 않습니다: " + id));
    }

    private DispatchTask requireDraftTask(UUID id) {
        DispatchTask task = findTaskOrThrow(id);
        if (task.getStatus() != DispatchTaskStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "배차 작업 편집은 " + DispatchTaskStatus.DRAFT.getDisplayName()
                            + " 상태에서만 가능합니다 — 현재=" + task.getStatus().getDisplayName());
        }
        return task;
    }

    private DispatchVehicleGroup findGroupOrThrow(UUID id) {
        return groupRepo.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchVehicleGroup 이 존재하지 않습니다: " + id));
    }

    /**
     * 삭제/복원 표시명 안전 변환.
     *
     * <p>{@code X-User-Name} 이 UUID 형태이면 사용자 화면에 raw UUID 가 노출되지 않도록 null 로 저장한다.
     *
     * @param callerName X-User-Name 헤더 값
     * @return UUID 가 아닌 표시명, 없으면 null
     */
    static String resolveActorName(String callerName) {
        if (callerName == null || callerName.isBlank()) {
            return null;
        }
        String resolved = ActorDisplayName.resolveNullable(null, callerName);
        if (resolved == null) return null;
        // deleted_by_name 컬럼 길이(100) 초과 시 INSERT 500(value too long) 방지 — UUID 널처리와 동일 방어계층.
        return resolved.length() > 100 ? resolved.substring(0, 100) : resolved;
    }
}
