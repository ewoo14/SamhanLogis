package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalAttachment;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 결재 첨부 저장소. */
@Repository
public interface ApprovalAttachmentRepository extends JpaRepository<ApprovalAttachment, UUID> {

    /** 결재 문서별 첨부 목록. */
    List<ApprovalAttachment> findAllByApprovalIdOrderByDisplayOrderAscCreatedAtAsc(UUID approvalId);

    /** 참조 문서번호로 연결된 활성 결재 첨부를 최근 결재순으로 조회한다. */
    @Query("""
            SELECT attachment
            FROM ApprovalAttachment attachment
            JOIN FETCH attachment.approval approval
            WHERE attachment.refDocType = :refDocType
              AND attachment.refDocNo = :refDocNo
            ORDER BY approval.createdAt DESC, approval.approvalNo DESC
            """)
    List<ApprovalAttachment> findAllByReference(
            @Param("refDocType") ApprovalReferenceDocType refDocType,
            @Param("refDocNo") String refDocNo);
}
