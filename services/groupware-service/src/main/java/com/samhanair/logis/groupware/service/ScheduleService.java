package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일정 service — 등록 / 수정 / 조회 / 삭제 (soft) / 참여자 관리.
 */
@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final ScheduleRepository repository;
    private final UserClient userClient;

    /**
     * 일정 등록 + 참여자 초기 등록.
     *
     * <p>소유자는 게이트웨이 주입 {@code X-User-Id} 로만 확정하고 본문 ownerId 는
     * 타인 소유 일정 생성 방지를 위해 신뢰하지 않는다. 참여자 목록은 기존 정상 흐름을 보존한다.
     */
    @Transactional
    public Schedule create(ScheduleRequest req, UUID ownerId) {
        if (!userClient.exists(ownerId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "소유자 미존재: " + ownerId);
        }
        try {
            Schedule schedule = Schedule.create(ownerId, req.title(), req.description(),
                    req.startsAt(), req.endsAt(), req.status());
            schedule.addParticipant(ownerId);
            if (req.participantIds() != null) {
                for (UUID participantId : req.participantIds()) {
                    if (!userClient.exists(participantId)) {
                        throw new BusinessException(ErrorCode.NOT_FOUND,
                                "참여자 미존재: " + participantId);
                    }
                    schedule.addParticipant(participantId);
                }
            }
            Schedule saved = repository.save(schedule);
            return saved;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public Schedule findById(UUID scheduleId) {
        return repository.findById(scheduleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "일정을 찾을 수 없습니다: " + scheduleId));
    }

    /** 소유자 또는 참여자 + 기간 조회. */
    @Transactional(readOnly = true)
    public List<Schedule> findInRange(UUID ownerId, LocalDateTime from, LocalDateTime to) {
        if (from == null || to == null || !to.isAfter(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "from < to 필수");
        }
        return repository.findVisibleInRange(ownerId, from, to);
    }

    /** 일정 수정 + 참여자 재정의 (전체 교체 패턴). 소유자 본인 일정만 수정 가능하다. */
    @Transactional
    public Schedule update(UUID scheduleId, ScheduleRequest req, UUID actorUserId) {
        Schedule schedule = findById(scheduleId);
        if (!schedule.getOwnerId().equals(actorUserId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "일정 소유자 본인만 수정할 수 있습니다");
        }
        // 기존 owner-less 행도 수정 시 자동 대상자 계약으로 승격한다.
        schedule.addParticipant(schedule.getOwnerId());
        try {
            schedule.update(req.title(), req.description(), req.startsAt(), req.endsAt(), req.status());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
        if (req.participantIds() != null) {
            // 전체 교체 — 기존 제거 후 신규 추가
            List<UUID> existing = schedule.getParticipantsView().stream()
                    .map(p -> p.getParticipantId())
                    .toList();
            for (UUID id : existing) {
                if (!req.participantIds().contains(id)) {
                    schedule.removeParticipant(id, actorUserId.toString());
                }
            }
            for (UUID id : req.participantIds()) {
                if (!userClient.exists(id)) {
                    throw new BusinessException(ErrorCode.NOT_FOUND, "참여자 미존재: " + id);
                }
                schedule.addParticipant(id);
            }
        }
        return schedule;
    }

    /** 참여자 단건 추가 — 명시 endpoint. */
    @Transactional
    public Schedule addParticipant(UUID scheduleId, UUID participantId) {
        if (!userClient.exists(participantId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "참여자 미존재: " + participantId);
        }
        Schedule schedule = findById(scheduleId);
        schedule.addParticipant(schedule.getOwnerId());
        schedule.addParticipant(participantId);
        return schedule;
    }

    /** 등록자 본인만 수행할 수 있는 soft-delete. */
    @Transactional
    public void delete(UUID scheduleId, UUID actorUserId) {
        Schedule schedule = findById(scheduleId);
        if (!schedule.getOwnerId().equals(actorUserId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "일정 등록자 본인만 삭제할 수 있습니다");
        }
        schedule.markDeleted(actorUserId.toString());
    }

}
