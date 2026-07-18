package com.samhanair.logis.groupware.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import com.samhanair.logis.groupware.dto.DocumentTemplateResponse;
import com.samhanair.logis.groupware.dto.DocumentTemplateUpdateRequest;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 문서 레이아웃 템플릿 CRUD와 DRAFT/ACTIVE lifecycle을 관리한다. */
@Service
@RequiredArgsConstructor
public class DocumentTemplateService {

    private static final String RESERVED_DEFAULT = "DEFAULT";
    private static final String RESERVED_GROUPWARE_DEFAULT = "GROUPWARE_DEFAULT";

    private final DocumentTemplateRepository repository;
    private final DocumentPayloadValidator validator;
    private final ObjectMapper objectMapper;

    /** 삭제되지 않은 문서 양식 목록을 조회한다. */
    @Transactional(readOnly = true)
    public List<DocumentTemplateResponse> findAll() {
        return repository.findAllByIsDeletedFalseOrderByDocTypeAscNameAsc().stream()
                .map(DocumentTemplateResponse::from).toList();
    }

    /** 문서 양식 단건을 조회한다. */
    @Transactional(readOnly = true)
    public DocumentTemplateResponse findResponse(UUID id) {
        return DocumentTemplateResponse.from(load(id));
    }

    /** docType별 active 문서 양식을 조회한다. 없으면 null을 반환한다. */
    @Transactional(readOnly = true)
    public DocumentTemplateResponse findActiveByDocType(String docType) {
        if (docType == null || docType.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "docType은 필수입니다");
        }
        return repository.findFirstByDocTypeAndStatusAndIsDeletedFalse(
                        docType.trim(), DocumentTemplateStatus.ACTIVE)
                .map(DocumentTemplateResponse::from)
                .orElse(null);
    }

    /** DRAFT 문서 양식을 생성한다. */
    @Transactional
    public DocumentTemplateResponse create(DocumentTemplateCreateRequest request, String actor) {
        String docType = normalizedDocType(request.docType());
        rejectReserved(docType);
        ensureUniqueName(docType, request.name(), null);
        DocumentPayload document = validator.validate(request.schemaVersion(), request.document());
        DocumentTemplate template = DocumentTemplate.create(docType, request.name(), request.schemaVersion(), document);
        try {
            return DocumentTemplateResponse.from(repository.saveAndFlush(template));
        } catch (DataIntegrityViolationException ex) {
            throw conflict("docType 내 문서 양식 이름이 중복되었습니다");
        }
    }

    /** DRAFT 문서 양식의 이름과 document를 교체한다. */
    @Transactional
    public DocumentTemplateResponse update(UUID id, DocumentTemplateUpdateRequest request, String actor) {
        DocumentTemplate template = load(id);
        String docType = normalizedDocType(request.docType());
        rejectReserved(docType);
        if (!template.getDocType().equals(docType)) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "docType은 수정할 수 없습니다");
        }
        ensureUniqueName(docType, request.name(), id);
        DocumentPayload document = validator.validate(request.schemaVersion(), request.document());
        template.rename(request.name()).updateDocument(document);
        try {
            return DocumentTemplateResponse.from(repository.saveAndFlush(template));
        } catch (DataIntegrityViolationException ex) {
            throw conflict("문서 양식 이름이 중복되었습니다");
        }
    }

    /** docType의 다른 active 양식을 강등한 뒤 대상을 활성화한다. */
    @Transactional
    public DocumentTemplateResponse activate(UUID id, String actor) {
        DocumentTemplate template = load(id);
        validator.validate(template.getSchemaVersion(), objectMapper.valueToTree(template.getDocument()));
        if (template.getStatus() == DocumentTemplateStatus.ACTIVE) {
            return DocumentTemplateResponse.from(template);
        }
        String safeActor = actor == null || actor.isBlank() ? "system" : actor;
        repository.demoteOtherActive(template.getDocType(), id, LocalDateTime.now(), safeActor);
        repository.flush();
        template.activate();
        try {
            repository.flush();
            return DocumentTemplateResponse.from(template);
        } catch (DataIntegrityViolationException | ObjectOptimisticLockingFailureException ex) {
            throw conflict("문서 양식 활성화 경합이 발생했습니다. 최신 목록을 확인해 주세요");
        }
    }

    /** active 문서 양식을 DRAFT로 전환한다. */
    @Transactional
    public DocumentTemplateResponse deactivate(UUID id) {
        DocumentTemplate template = load(id).deactivate();
        repository.flush();
        return DocumentTemplateResponse.from(template);
    }

    /** 문서 양식을 soft-delete한다. active 삭제도 허용하여 active 0 상태를 만든다. */
    @Transactional
    public void delete(UUID id, String actor) {
        load(id).deactivate().softDelete(actor);
        repository.flush();
    }

    private DocumentTemplate load(UUID id) {
        if (id == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서 양식 id는 필수입니다");
        }
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "문서 양식을 찾을 수 없습니다: " + id));
    }

    private void ensureUniqueName(String docType, String name, UUID excludedId) {
        boolean duplicated = repository.findByDocTypeAndIsDeletedFalse(docType).stream()
                .anyMatch(candidate -> !candidate.getId().equals(excludedId) && candidate.getName().equals(name.trim()));
        if (duplicated) {
            throw conflict("docType 내 문서 양식 이름이 중복되었습니다");
        }
    }

    private static String normalizedDocType(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "docType은 1~40자여야 합니다");
        }
        return value.trim();
    }

    private static void rejectReserved(String docType) {
        if (RESERVED_DEFAULT.equals(docType) || RESERVED_GROUPWARE_DEFAULT.equals(docType)) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    "예약된 docType은 문서 양식으로 등록할 수 없습니다: " + docType);
        }
    }

    private static BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.CONFLICT, message);
    }
}
