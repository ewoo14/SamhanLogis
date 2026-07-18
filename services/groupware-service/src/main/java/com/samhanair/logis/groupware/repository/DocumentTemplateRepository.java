package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 문서 레이아웃 템플릿 저장소. */
@Repository
public interface DocumentTemplateRepository extends JpaRepository<DocumentTemplate, UUID> {

    /** docType의 활성 문서 양식 하나를 조회한다. */
    Optional<DocumentTemplate> findFirstByDocTypeAndStatusAndIsDeletedFalse(
            String docType, DocumentTemplateStatus status);

    /** docType의 삭제되지 않은 문서 양식을 조회한다. */
    List<DocumentTemplate> findByDocTypeAndIsDeletedFalse(String docType);

    /** 관리자 목록을 docType/name 순으로 조회한다. */
    List<DocumentTemplate> findAllByIsDeletedFalseOrderByDocTypeAscNameAsc();

    /** 대상 외 동일 docType ACTIVE 행을 DRAFT로 강등하면서 bulk audit/version을 명시 갱신한다. */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE DocumentTemplate t SET t.status = com.samhanair.logis.groupware.domain.DocumentTemplateStatus.DRAFT, "
            + "t.lockVersion = t.lockVersion + 1, t.modifiedAt = :now, t.modifiedBy = :actor "
            + "WHERE t.docType = :docType AND t.status = com.samhanair.logis.groupware.domain.DocumentTemplateStatus.ACTIVE "
            + "AND t.id <> :targetId AND t.isDeleted = false")
    int demoteOtherActive(@Param("docType") String docType, @Param("targetId") UUID targetId,
                          @Param("now") LocalDateTime now, @Param("actor") String actor);
}
