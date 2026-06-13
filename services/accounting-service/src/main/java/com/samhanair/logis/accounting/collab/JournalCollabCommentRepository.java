package com.samhanair.logis.accounting.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 회계전표 협업 댓글 repository.
 *
 * <p>문서 스코프 mutation 을 위해 commentId 단독 조회를 금지하고, 항상 documentType/documentId 를
 * 함께 확인한다.
 */
public interface JournalCollabCommentRepository extends JpaRepository<JournalCollabComment, UUID> {

    /** 댓글 mutation 은 path journal 과 같은 문서에 속한 댓글만 반환한다. */
    Optional<JournalCollabComment> findByIdAndDocumentTypeAndDocumentId(
            UUID id, CollabDocumentType documentType, UUID documentId);

    /** 회계전표별 최근 댓글 백필. {@code @SQLRestriction} 으로 soft-deleted row 는 제외된다. */
    @Query("""
            select c
            from JournalCollabComment c
            where c.documentType = :documentType
              and c.documentId = :documentId
            order by c.createdAt desc
            """)
    List<JournalCollabComment> findRecent(
            @Param("documentType") CollabDocumentType documentType,
            @Param("documentId") UUID documentId,
            Pageable pageable);

    /** 회계전표별 전체 댓글 작성자 해석용 목록. 최신 댓글순 우선. */
    List<JournalCollabComment> findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
            CollabDocumentType documentType, UUID documentId);
}
