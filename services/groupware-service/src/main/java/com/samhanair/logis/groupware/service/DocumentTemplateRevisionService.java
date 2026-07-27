package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateRevision;
import com.samhanair.logis.groupware.dto.DocumentTemplateRevisionResponse;
import com.samhanair.logis.groupware.repository.DocumentTemplateRevisionRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 문서 레이아웃 이력 append와 재인쇄 조회를 담당한다. */
@Service
@RequiredArgsConstructor
public class DocumentTemplateRevisionService {

    private final DocumentTemplateRevisionRepository repository;

    /**
     * 현재 양식 revision이 없을 때만 append한다. 호출자는 양식 변경과 같은 transaction을 사용한다.
     *
     * <p>FABLE5 R1 M-2 fix: Spring Data repository proxy의 {@code saveAndFlush}를 사용해
     * unique(template_id, revision) 경합을 {@link DataIntegrityViolationException}으로
     * 변환한다. raw {@code EntityManager#persist}는 이 예외 변환 경계를 우회하므로 사용하지 않는다.
     */
    @Transactional
    public DocumentTemplateRevision ensureCurrentRevision(DocumentTemplate template) {
        return ensureCurrentRevision(template, true);
    }

    /**
     * 승인 시 현재 양식 revision을 준비하되 즉시 flush하지 않는다.
     *
     * <p>승인 엔티티는 먼저 {@code APPROVED} 상태로 바뀌므로 {@code saveAndFlush}를 여기서 호출하면
     * pin 필드가 아직 비어 있는 중간 UPDATE가 V15 트리거에 의해 사후 각인 변경으로 오인된다.
     * 호출자인 {@code ApprovalLineService}가 pin 세 필드를 모두 설정한 뒤 approval_lines와 함께 flush한다.
     *
     * @param template 승인 시점의 ACTIVE 양식
     * @return 기존 또는 이번 transaction에 append 예약된 revision
     */
    @Transactional
    public DocumentTemplateRevision ensureCurrentRevisionForApproval(DocumentTemplate template) {
        return ensureCurrentRevision(template, false);
    }

    private DocumentTemplateRevision ensureCurrentRevision(DocumentTemplate template, boolean flush) {
        return repository.findByTemplateIdAndRevisionAndIsDeletedFalse(template.getId(), template.getRevision())
                .orElseGet(() -> {
                    DocumentTemplateRevision revision = DocumentTemplateRevision.of(template);
                    try {
                        return flush ? repository.saveAndFlush(revision) : repository.save(revision);
                    } catch (DataIntegrityViolationException ex) {
                        throw new BusinessException(ErrorCode.CONFLICT,
                                "문서 양식 revision 생성 경합이 발생했습니다. 다시 시도해 주세요");
                    }
                });
    }

    /** 재인쇄 시 각인된 revision 한 건을 조회한다. soft-delete된 양식의 이력도 계속 읽을 수 있다. */
    @Transactional(readOnly = true)
    public DocumentTemplateRevisionResponse findResponse(UUID templateId, int revision) {
        if (templateId == null || revision <= 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 revision 참조가 유효하지 않습니다");
        }
        return repository.findByTemplateIdAndRevisionAndIsDeletedFalse(templateId, revision)
                .map(DocumentTemplateRevisionResponse::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "문서 양식 revision을 찾을 수 없습니다"));
    }
}
