package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.domain.ScheduleStatus;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 일정 단건 응답 DTO.
 *
 * @param scheduleId 식별자
 * @param ownerId 소유자 내부 식별자 (화면 표시 금지)
 * @param title 제목
 * @param description 본문
 * @param startsAt 시작
 * @param endsAt 종료
 * @param status 상태
 * @param participantIds 참여자 내부 식별자 목록 (화면 표시 금지; 화면은 이름·부서·담당자코드 사용)
 */
public record ScheduleResponse(
        UUID scheduleId,
        UUID ownerId,
        String title,
        String description,
        LocalDateTime startsAt,
        LocalDateTime endsAt,
        ScheduleStatus status,
        List<UUID> participantIds
) {

    public static ScheduleResponse from(Schedule s) {
        List<UUID> ids = new ArrayList<>();
        ids.add(s.getOwnerId());
        ids.addAll(s.getParticipantsView().stream()
                .map(p -> p.getParticipantId())
                .toList());
        return new ScheduleResponse(s.getId(), s.getOwnerId(), s.getTitle(), s.getDescription(),
                s.getStartsAt(), s.getEndsAt(), s.getStatus(), ids.stream().distinct().toList());
    }
}
