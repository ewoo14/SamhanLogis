package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 결재선 생성 요청 DTO.
 *
 * @param requesterId 요청자 user UUID
 * @param title 제목
 * @param content 본문 (선택)
 * @param approverIds 수동/override 결재자 chain. config 미설정 유형은 1명 이상 필요
 * @param templateId 결재유형 템플릿 UUID (선택)
 * @param fieldValues 템플릿 fieldKey -> value (선택)
 * @param references 생성과 같은 transaction으로 저장할 문서 참조 첨부 (선택)
 */
public record ApprovalLineCreateRequest(
        @NotNull UUID requesterId,
        @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) String content,
        List<@NotNull UUID> approverIds,
        UUID templateId,
        Map<String, String> fieldValues,
        List<@Valid ApprovalAttachmentRequest> references
) {
    /** 레거시 자유형 결재 생성 요청과의 source 호환 생성자. */
    public ApprovalLineCreateRequest(UUID requesterId, String title, String content,
                                     List<UUID> approverIds) {
        this(requesterId, title, content, approverIds, null, null, List.of());
    }

    /** 기존 템플릿 생성 호출과의 source 호환 생성자. */
    public ApprovalLineCreateRequest(UUID requesterId, String title, String content,
                                     List<UUID> approverIds, UUID templateId,
                                     Map<String, String> fieldValues) {
        this(requesterId, title, content, approverIds, templateId, fieldValues, List.of());
    }
}
