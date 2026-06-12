package com.samhanair.logis.slip.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 입출고전표 협업 수정 제안 repository.
 *
 * <p>list endpoint 는 전표 문서 스코프(documentType + documentId) 로만 조회하여 다른 전표의
 * suggestion UUID 를 path 조작으로 노출하지 않는다.
 */
public interface SlipCollabSuggestionRepository extends JpaRepository<SlipCollabSuggestion, UUID> {

    /** 전표별 제안 목록. 최신 수정순 우선. */
    List<SlipCollabSuggestion> findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId);

    /** 제안 결정/철회 전 path slip 과 같은 문서에 속한 제안인지 확인한다. */
    Optional<SlipCollabSuggestion> findByIdAndDocumentTypeAndDocumentId(
            UUID id, CollabDocumentType documentType, UUID documentId);
}
