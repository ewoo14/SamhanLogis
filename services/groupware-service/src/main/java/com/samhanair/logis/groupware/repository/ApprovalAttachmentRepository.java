package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalAttachment;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 결재 첨부 저장소. */
@Repository
public interface ApprovalAttachmentRepository extends JpaRepository<ApprovalAttachment, UUID> {

    /** 결재 문서별 첨부 목록. */
    List<ApprovalAttachment> findAllByApprovalIdOrderByDisplayOrderAscCreatedAtAsc(UUID approvalId);
}
