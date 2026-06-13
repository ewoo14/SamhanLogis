package com.samhanair.logis.slip.collab;

import com.samhanair.logis.collab.CollabRealtimePublisher;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 협업 1-인 수정완료 서비스.
 *
 * <p>외부 UX 는 제안/수락 2단계가 아니라 권한자 본인의 "수정완료" 1회 커밋이다.
 * 내부 이력 테이블은 기존 {@code slip_collab_suggestions} 를 재사용하되, 신규 row 는
 * 생성 즉시 ACCEPTED 로 닫아 proposer=decider=editor 계약을 보존한다.
 */
@Service
public class SlipCollabEditService {

    private final SlipCollabSuggestionRepository suggestionRepository;
    private final CollabRealtimePublisher publisher;

    public SlipCollabEditService(SlipCollabSuggestionRepository suggestionRepository,
                                 CollabRealtimePublisher publisher) {
        this.suggestionRepository = suggestionRepository;
        this.publisher = publisher;
    }

    /**
     * changeSet 검증, overlay batch 적용, ACCEPTED 이력 저장을 하나의 트랜잭션으로 수행한다.
     *
     * @return ACCEPTED 이력과 변경 후 전표 상세
     */
    @Transactional
    public Result commitEdit(SlipDocumentCollaborationPort port, UUID slipId,
                             UUID editorId, String editorName, String changeSet, String reason) {
        String enrichedChangeSet = port.enrichChangeSetWithBefore(slipId, changeSet);
        if (!port.canPropose(editorId, slipId) || !port.canDecide(editorId, slipId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "전표 수정완료 권한이 없습니다");
        }

        SlipDetailResponse updated = port.applyOverlayPatchBatch(slipId, enrichedChangeSet, editorId, editorName);

        SlipCollabSuggestion edit = SlipCollabSuggestion.create(
                port.documentType(), slipId, editorId, editorName, enrichedChangeSet, blankToNull(reason));
        edit.accept(editorId, editorName);
        SlipCollabSuggestion saved = suggestionRepository.save(edit);
        publisher.publish(slipId, CollabSuggestionService.EVENT_SUGGESTION_ACCEPTED,
                java.util.Map.of(
                        "id", saved.getId().toString(),
                        "documentType", saved.getDocumentType().name(),
                        "proposerName", saved.getProposerName(),
                        "status", saved.getStatus().name(),
                        "decidedByName", saved.getDecidedByName()));
        return new Result(saved, updated);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** 수정완료 결과. */
    public record Result(SlipCollabSuggestion edit, SlipDetailResponse slip) {
    }
}
