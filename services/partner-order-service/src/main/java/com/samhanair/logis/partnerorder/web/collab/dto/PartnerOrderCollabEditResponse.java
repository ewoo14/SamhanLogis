package com.samhanair.logis.partnerorder.web.collab.dto;

import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;

/**
 * 주문 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param order 수정 후 주문 상세
 */
public record PartnerOrderCollabEditResponse(
        PartnerOrderCollabSuggestionResponse edit,
        PartnerOrderDetailResponse order
) {
}
