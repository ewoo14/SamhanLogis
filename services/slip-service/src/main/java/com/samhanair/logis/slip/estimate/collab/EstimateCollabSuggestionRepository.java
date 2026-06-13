package com.samhanair.logis.slip.estimate.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 견적 협업 수정 이력 repository.
 *
 * <p>list endpoint 는 견적 문서 스코프(documentType + documentId) 로만 조회하여 다른 견적의
 * suggestion UUID 를 path 조작으로 노출하지 않는다.
 */
public interface EstimateCollabSuggestionRepository extends JpaRepository<EstimateCollabSuggestion, UUID> {

    /** 견적별 수정 이력 목록. 최신 수정순 우선. */
    List<EstimateCollabSuggestion> findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId);

    /** 견적별 상태 필터 수정 이력 목록. 최신 수정순 우선. */
    List<EstimateCollabSuggestion> findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId, CollabSuggestionStatus status);

    /** 기존 2단계 호환 service 가 같은 문서에 속한 이력인지 확인할 때 사용한다. */
    Optional<EstimateCollabSuggestion> findByIdAndDocumentTypeAndDocumentId(
            UUID id, CollabDocumentType documentType, UUID documentId);
}
