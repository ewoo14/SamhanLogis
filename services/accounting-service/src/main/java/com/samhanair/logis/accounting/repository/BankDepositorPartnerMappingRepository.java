package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 활성 입금자명 매핑 조회와 PostgreSQL 원자 upsert repository. */
public interface BankDepositorPartnerMappingRepository
        extends JpaRepository<BankDepositorPartnerMapping, UUID> {

    /** 활성 정규화 키 매핑을 조회한다. */
    Optional<BankDepositorPartnerMapping> findByNormalizedNameAndIsDeletedFalse(String normalizedName);

    /**
     * soft-deleted 행을 포함해 정규화 키의 매핑 id 목록을 조회한다 — #810 적대검증 R1 (L4-H2).
     *
     * <p>entity 의 {@code @SQLRestriction(is_deleted = false)} 를 우회해야 삭제된 매핑의
     * 감사 이력도 entityId 로 연속 조회할 수 있으므로 native query 를 사용한다.
     * 같은 키의 soft-delete 후 재생성으로 다건이 존재할 수 있다.
     */
    @Query(value = """
            SELECT id FROM bank_depositor_partner_mapping
             WHERE normalized_name = :normalizedName
            """, nativeQuery = true)
    List<UUID> findIdsByNormalizedNameIncludingDeleted(@Param("normalizedName") String normalizedName);

    /** 관리 화면의 활성 매핑 목록을 정렬 조회한다. */
    List<BankDepositorPartnerMapping> findAllByIsDeletedFalse(Sort sort);

    /**
     * 활성 정규화 키 기준 원자 upsert.
     *
     * <p>partial unique index와 동일한 predicate를 ON CONFLICT에 명시해 동시 import가 같은 키를
     * 두 행으로 만들지 않도록 한다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO bank_depositor_partner_mapping
                (id, raw_name, normalized_name, partner_id, partner_code,
                 created_at, created_by, modified_at, modified_by, is_deleted)
            VALUES
                (gen_random_uuid(), :rawName, :normalizedName, :partnerId, :partnerCode,
                 NOW(), :actor, NOW(), :actor, FALSE)
            ON CONFLICT (normalized_name) WHERE is_deleted = FALSE
            DO UPDATE SET
                raw_name = EXCLUDED.raw_name,
                partner_id = EXCLUDED.partner_id,
                partner_code = EXCLUDED.partner_code,
                modified_at = NOW(),
                modified_by = EXCLUDED.modified_by
            """, nativeQuery = true)
    int upsertActive(@Param("rawName") String rawName,
                     @Param("normalizedName") String normalizedName,
                     @Param("partnerId") UUID partnerId,
                     @Param("partnerCode") String partnerCode,
                     @Param("actor") String actor);

    /** 동일 정규화 키의 현재 상태 조회·갱신·감사를 하나의 직렬화 경계로 묶는다. */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext(CAST(:normalizedName AS text)))", nativeQuery = true)
    void acquireNormalizedNameAdvisoryLock(@Param("normalizedName") String normalizedName);
}
