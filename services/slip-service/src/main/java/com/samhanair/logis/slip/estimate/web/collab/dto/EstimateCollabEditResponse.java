package com.samhanair.logis.slip.estimate.web.collab.dto;

import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;

/**
 * 견적 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param estimate 수정 후 견적 상세
 */
public record EstimateCollabEditResponse(
        EstimateCollabSuggestionResponse edit,
        EstimateDetailResponse estimate
) {
}
