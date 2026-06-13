package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.slip.web.dto.SlipDetailResponse;

/**
 * 전표 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param slip 수정 후 전표 상세 요약
 */
public record SlipCollabEditResponse(
        SlipCollabSuggestionResponse edit,
        SlipDetailResponse slip
) {
}
