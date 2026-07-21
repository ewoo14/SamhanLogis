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
        return repository.findByTemplateIdAndRevisionAndIsDeletedFalse(template.getId(), template.getRevision())
                .orElseGet(() -> {
                    DocumentTemplateRevision revision = DocumentTemplateRevision.of(template);
                    try {
                        return repository.saveAndFlush(revision);
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
