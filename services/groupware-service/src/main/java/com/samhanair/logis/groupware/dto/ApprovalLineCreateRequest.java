package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.policy.SettlementApprovalReferencePolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
        @Size(max = SettlementApprovalReferencePolicy.MAX_ATOMIC_REFERENCES,
                message = "결재 생성 시 참조는 최대 "
                        + SettlementApprovalReferencePolicy.MAX_ATOMIC_REFERENCES
                        + "건까지 가능합니다. 초과분은 결재 생성 후 상세 화면에서 나누어 추가해 주세요")
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
