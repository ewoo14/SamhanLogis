package com.samhanair.logis.slip.service.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
import java.util.regex.Pattern;
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
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final long CASCADE_RESTORE_WINDOW_SECONDS = 2;

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
        requireDraftTask(dispatchTaskId);
        int nextSeq = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(dispatchTaskId).size() + 1;
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
        requireDraftTask(dispatchTaskId);
        int nextSeq = groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(dispatchTaskId).size() + 1;
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
        requireDraftTask(dispatchTaskId);
        String actorName = resolveActorName(callerName);
        slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(vehicleGroupId)
                .forEach(m -> {
                    m.markDeletedWithName(actor, actorName);
                    slipMapRepo.save(m);
                });
        group.markDeletedWithName(actor, actorName);
        groupRepo.save(group);
        publishBoardChanged("DELETED");
    }

    /** slip 을 그룹에 추가 — sequence 자동 증가 (현재 group 내 slip 개수 + 1). */
    public DispatchVehicleGroupSlip assignSlip(UUID dispatchTaskId, UUID vehicleGroupId, UUID slipId) {
        lockNumberSeries("dispatch_slip_assign_" + slipId);
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
                    "미배차 전표만 배차 그룹에 추가할 수 있습니다: " + slip.getDispatchStatus());
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
     * @param dispatchTaskId 배차 작업 UUID
     * @param vehicleGroupId 차량 그룹 UUID
     * @param actor 복원 주체 userId
     * @param callerName 복원 주체 표시명 원본 (UUID 형태면 저장하지 않음)
     */
    public void restoreVehicleGroup(UUID dispatchTaskId, UUID vehicleGroupId, String actor, String callerName) {
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

        LocalDateTime deletedAt = group.getDeletedAt();
        String deletedBy = group.getDeletedBy();
        String actorName = resolveActorName(callerName);
        List<DispatchVehicleGroupSlip> cascadeMappings = deletedAt == null || deletedBy == null
                ? List.of()
                : slipMapRepo.findDeletedCascadeMappings(
                        vehicleGroupId,
                        deletedBy,
                        deletedAt.minusSeconds(CASCADE_RESTORE_WINDOW_SECONDS),
                        deletedAt.plusSeconds(CASCADE_RESTORE_WINDOW_SECONDS));

        group.markRestoredWithNameCleared();
        cascadeMappings.forEach(DispatchVehicleGroupSlip::markRestoredWithNameCleared);
        groupRepo.save(group);
        slipMapRepo.saveAll(cascadeMappings);
        log.info("배차 차량 그룹 복원 — taskId={} groupId={} actor={} actorName={} cascadeMappings={}",
                dispatchTaskId, vehicleGroupId, actor, actorName, cascadeMappings.size());
        publishBoardChanged("RESTORED");
    }

    /**
     * 삭제된 그룹-전표 매핑 1건을 복원한다.
     *
     * <p>삭제된 매핑은 {@code @SQLRestriction} 컬렉션으로는 보이지 않으므로 native IncludingDeleted
     * 조회를 사용한다.
     *
     * @param vehicleGroupId 차량 그룹 UUID
     * @param slipId 전표 UUID
     * @param actor 복원 주체 userId
     * @param callerName 복원 주체 표시명 원본 (UUID 형태면 저장하지 않음)
     */
    public void restoreSlipFromGroup(UUID vehicleGroupId, UUID slipId, String actor, String callerName) {
        DispatchVehicleGroup group = groupRepo.findByIdIncludingDeleted(vehicleGroupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DispatchVehicleGroup 이 존재하지 않습니다: " + vehicleGroupId));
        if (Boolean.TRUE.equals(group.getIsDeleted())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "삭제된 차량 그룹의 전표는 그룹 복원으로만 복원할 수 있습니다.");
        }
        if (!group.isDispatchPending()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발송된 차량 그룹의 전표는 복원할 수 없습니다.");
        }
        requireDraftTask(group.getDispatchTaskId());
        DispatchVehicleGroupSlip mapping = slipMapRepo
                .findByVehicleGroupIdAndSlipIdIncludingDeleted(vehicleGroupId, slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "그룹에 매핑된 slip 이 없습니다."));
        if (!Boolean.TRUE.equals(mapping.getIsDeleted())) {
            return;
        }
        String actorName = resolveActorName(callerName);
        mapping.markRestoredWithNameCleared();
        slipMapRepo.save(mapping);
        log.info("배차 그룹 전표 매핑 복원 — groupId={} slipId={} actor={} actorName={}",
                vehicleGroupId, slipId, actor, actorName);
        publishBoardChanged("RESTORED");
    }

    /** 배차 목록 변경 발화 (커밋 후). changeType = CREATED/UPDATED/DELETED/STATUS_CHANGED. */
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
                    "배차 작업 편집은 DRAFT 상태에서만 가능합니다 — 현재=" + task.getStatus());
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
        String trimmed = callerName.trim();
        if (UUID_PATTERN.matcher(trimmed).matches()) {
            return null;
        }
        return trimmed;
    }
}
