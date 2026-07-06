package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ScheduleStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 일정 등록/수정 요청 DTO.
 *
 * <p>ownerId 는 deprecated. 일정 소유자는 {@code X-User-Id} 헤더로만 확정하며 이 값은 무시한다.
 *
 * @param ownerId deprecated. 소유자 user UUID 로 사용하지 않음
 * @param title 제목
 * @param description 본문 (선택)
 * @param startsAt 시작 시각
 * @param endsAt 종료 시각 (startsAt 이후)
 * @param status 일정 상태 (null → DRAFT 기본)
 * @param participantIds 참여자 user UUID 목록 (선택)
 */
public record ScheduleRequest(
        UUID ownerId,
        @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) String description,
        @NotNull LocalDateTime startsAt,
        @NotNull LocalDateTime endsAt,
        ScheduleStatus status,
        List<UUID> participantIds
) {
}
