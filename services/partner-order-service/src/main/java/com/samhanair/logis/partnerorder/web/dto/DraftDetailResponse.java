package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import java.time.LocalDateTime;

/**
 * 임시저장 상세 응답 — payload 포함. draft 단건 로드 시 사용.
 *
 * @param draftId UUID (form hidden)
 * @param draftSeq 거래처별 순번
 * @param label 사용자 표시 라벨
 * @param payloadJson legacy snapshot 페이로드
 * @param expiresAt 만료 시각
 * @param createdAt 생성 시각
 */
public record DraftDetailResponse(
        String draftId,
        long draftSeq,
        String label,
        String payloadJson,
        LocalDateTime expiresAt,
        LocalDateTime createdAt) {

    public static DraftDetailResponse from(PartnerOrderDraft draft) {
        return new DraftDetailResponse(
                draft.getId().toString(),
                draft.getDraftSeq(),
                draft.getLabel(),
                draft.getPayloadJson(),
                draft.getExpiresAt(),
                draft.getCreatedAt());
    }
}
