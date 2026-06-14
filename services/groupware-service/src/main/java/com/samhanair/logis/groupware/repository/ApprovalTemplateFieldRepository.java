package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalTemplateField;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 결재유형 템플릿 필드 저장소. */
@Repository
public interface ApprovalTemplateFieldRepository extends JpaRepository<ApprovalTemplateField, UUID> {

    /** 템플릿별 필드 목록. */
    List<ApprovalTemplateField> findAllByTemplateIdOrderByDisplayOrderAscFieldKeyAsc(UUID templateId);
}
