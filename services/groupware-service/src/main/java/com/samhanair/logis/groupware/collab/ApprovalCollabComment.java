package com.samhanair.logis.groupware.collab;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabDocumentType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재 협업 댓글.
 *
 * <p>shared/collab-core 의 {@link CollabCommentRecord} 를 APPROVAL_LINE 문서에 연결하는
 * concrete entity 다. 작성자 UUID 는 감사 추적 전용이며 사용자 화면에는 authorName 만 표시한다.
 */
@Entity
@Table(name = "approval_collab_comments")
@SQLRestriction("is_deleted = false")
public class ApprovalCollabComment extends CollabCommentRecord {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    protected ApprovalCollabComment() {
    }

    private ApprovalCollabComment(CollabDocumentType documentType, UUID documentId, String anchor,
                                  UUID authorId, String authorName, String body, UUID parentId) {
        init(documentType, documentId, anchor, authorId, authorName, body, parentId);
    }

    @Override
    public UUID getId() {
        return id;
    }

    /** 신규 결재 협업 댓글 factory. */
    public static ApprovalCollabComment create(CollabDocumentType documentType, UUID documentId,
                                               String anchor, UUID authorId, String authorName,
                                               String body, UUID parentId) {
        return new ApprovalCollabComment(
                documentType, documentId, anchor, authorId, authorName, body, parentId);
    }
}
