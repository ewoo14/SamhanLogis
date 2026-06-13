package com.samhanair.logis.groupware.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 결재 협업 수정 이력 repository. */
public interface ApprovalCollabSuggestionRepository extends JpaRepository<ApprovalCollabSuggestion, UUID> {

    /** 결재별 수정 이력 목록. 최신 수정순 우선. */
    List<ApprovalCollabSuggestion> findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId);

    /** 결재별 상태 필터 수정 이력 목록. 최신 수정순 우선. */
    List<ApprovalCollabSuggestion> findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId, CollabSuggestionStatus status);

    Optional<ApprovalCollabSuggestion> findByIdAndDocumentTypeAndDocumentId(
            UUID id, CollabDocumentType documentType, UUID documentId);
}
