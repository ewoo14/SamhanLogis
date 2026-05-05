package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import java.time.LocalDateTime;

/**
 * 임시저장 응답. UUID 비공개 — id 필드는 form hidden / path variable 용으로만 응답에 포함하되
 * 사용자 화면 표시는 draftSeq + label 만 사용 (FE 가드).
 *
 * @param draftId UUID (form hidden)
 * @param draftSeq 거래처별 순번 (사용자 노출 식별자)
 * @param label 사용자 표시 라벨
 * @param expiresAt 30일 TTL 만료 시각
 * @param createdAt 생성 시각
 */
public record DraftResponse(
        String draftId,
        long draftSeq,
        String label,
        LocalDateTime expiresAt,
        LocalDateTime createdAt) {

    public static DraftResponse from(PartnerOrderDraft draft) {
        return new DraftResponse(
                draft.getId().toString(),
                draft.getDraftSeq(),
                draft.getLabel(),
                draft.getExpiresAt(),
                draft.getCreatedAt());
    }
}
