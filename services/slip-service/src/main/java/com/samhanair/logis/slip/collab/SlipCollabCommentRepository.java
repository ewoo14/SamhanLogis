package com.samhanair.logis.slip.collab;

import com.samhanair.logis.collab.CollabDocumentType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 입출고전표 협업 댓글 repository.
 *
 * <p>문서 스코프 mutation 을 위해 commentId 단독 조회를 금지하고, 항상 documentType/documentId 를
 * 함께 확인한다.
 */
public interface SlipCollabCommentRepository extends JpaRepository<SlipCollabComment, UUID> {

    /** 댓글 mutation 은 path slip 과 같은 문서에 속한 댓글만 반환한다. */
    Optional<SlipCollabComment> findByIdAndDocumentTypeAndDocumentId(
            UUID id, CollabDocumentType documentType, UUID documentId);

    /** 전표별 최근 댓글 백필. {@code @SQLRestriction} 으로 soft-deleted row 는 제외된다. */
    @Query("""
            select c
            from SlipCollabComment c
            where c.documentType = :documentType
              and c.documentId = :documentId
            order by c.createdAt desc
            """)
    List<SlipCollabComment> findRecent(
            @Param("documentType") CollabDocumentType documentType,
            @Param("documentId") UUID documentId,
            Pageable pageable);
}
