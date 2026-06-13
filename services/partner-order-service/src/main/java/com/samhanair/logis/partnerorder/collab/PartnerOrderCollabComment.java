package com.samhanair.logis.partnerorder.collab;

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
 * 주문 협업 댓글.
 *
 * <p>shared/collab-core 의 {@link CollabCommentRecord} 를 PARTNER_ORDER 문서에 연결하는
 * concrete entity 다. 작성자 UUID 는 감사 추적 전용이며 사용자 화면에는 authorName 만 표시한다.
 */
@Entity
@Table(name = "partner_order_collab_comments")
@SQLRestriction("is_deleted = false")
public class PartnerOrderCollabComment extends CollabCommentRecord {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    protected PartnerOrderCollabComment() {
    }

    private PartnerOrderCollabComment(CollabDocumentType documentType, UUID documentId, String anchor,
                                      UUID authorId, String authorName, String body, UUID parentId) {
        init(documentType, documentId, anchor, authorId, authorName, body, parentId);
    }

    @Override
    public UUID getId() {
        return id;
    }

    /**
     * 신규 주문 협업 댓글 factory.
     *
     * @param documentType PARTNER_ORDER
     * @param documentId 주문 UUID
     * @param anchor 필드/행 anchor. 없으면 주문 전체 댓글.
     * @param authorId 작성자 UUID. 화면 노출 금지.
     * @param authorName 작성자 표시명.
     * @param body 본문.
     * @param parentId 부모 댓글 ID. 없으면 최상위 댓글.
     * @return 영속화 전 신규 댓글
     */
    public static PartnerOrderCollabComment create(CollabDocumentType documentType, UUID documentId,
                                                   String anchor, UUID authorId, String authorName,
                                                   String body, UUID parentId) {
        return new PartnerOrderCollabComment(
                documentType, documentId, anchor, authorId, authorName, body, parentId);
    }
}
