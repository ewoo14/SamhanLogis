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

    /**
     * 대상 외 동일 docType ACTIVE 행을 DRAFT로 강등하면서 bulk audit/version을 명시 갱신한다.
     *
     * <p>{@code flushAutomatically = true} 로 선행 변경을 먼저 flush 하고, {@code clearAutomatically = true}
     * 로 bulk UPDATE 후 1차 캐시를 비워 강등된 행의 stale 상태가 영속성 컨텍스트에 남지 않게 한다.
     * bulk 쿼리는 {@code @Version}/audit listener 를 우회하므로 {@code lock_version}/{@code modified_at}/
     * {@code modified_by} 를 직접 갱신한다. 컨텍스트가 비워지므로 호출측은 활성화 대상을 다시 로드해야 한다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE DocumentTemplate t SET t.status = com.samhanair.logis.groupware.domain.DocumentTemplateStatus.DRAFT, "
            + "t.lockVersion = t.lockVersion + 1, t.modifiedAt = :now, t.modifiedBy = :actor "
            + "WHERE t.docType = :docType AND t.status = com.samhanair.logis.groupware.domain.DocumentTemplateStatus.ACTIVE "
            + "AND t.id <> :targetId AND t.isDeleted = false")
    int demoteOtherActive(@Param("docType") String docType, @Param("targetId") UUID targetId,
                          @Param("now") LocalDateTime now, @Param("actor") String actor);
}
