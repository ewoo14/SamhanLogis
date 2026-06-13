package com.samhanair.logis.slip.web.dispatch.dto;

import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;

/**
 * 배차 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param task 수정 후 배차 상세
 */
public record DispatchCollabEditResponse(
        DispatchCollabSuggestionResponse edit,
        DispatchTaskDetailResponse task
) {
}
