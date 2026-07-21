package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.DocumentTemplateRevision;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 문서 양식 revision 이력 저장소. 수정·삭제 메서드는 의도적으로 제공하지 않는다. */
@Repository
public interface DocumentTemplateRevisionRepository extends JpaRepository<DocumentTemplateRevision, UUID> {

    Optional<DocumentTemplateRevision> findByTemplateIdAndRevisionAndIsDeletedFalse(UUID templateId, int revision);
}
