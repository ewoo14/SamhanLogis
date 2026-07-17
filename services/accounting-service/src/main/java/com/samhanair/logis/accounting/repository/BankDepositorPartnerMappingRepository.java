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

    /**
     * 동일 정규화 키의 현재 상태 조회·갱신·감사를 하나의 직렬화 경계로 묶는다.
     *
     * <p>#810 R3-CODEX (S3-L1): 단일 키 획득도 {@link #acquireNormalizedNameAdvisoryLocks} 공용
     * SQL(64bit {@code hashtextextended} + lock_id 정렬 획득)로 위임해 create/update/delete/learn
     * 전 경로의 lock ID 계산·획득 순서를 하나로 통일한다.
     */
    default void acquireNormalizedNameAdvisoryLock(String normalizedName) {
        acquireNormalizedNameAdvisoryLocks(normalizedName, normalizedName);
    }

    /**
     * 두 정규화 키의 advisory lock 을 <b>실제 lock 자원(lock_id) 오름차순</b>으로 획득한다
     * — #810 R3-CODEX (S3-L1).
     *
     * <p>구 구현은 32bit {@code hashtext} + Java 문자열 정렬이었는데, 해시 충돌로
     * "문자열 정렬 순서 ≠ 실제 lock 자원의 수치 순서"가 되면 2-key rename 끼리 서로 반대
     * 순서로 대기해 데드락이 발생한다(psql 실재현). 64bit {@code hashtextextended}(seed 0)로
     * 충돌 확률을 낮추고, {@code DISTINCT lock_id ORDER BY lock_id} 로 어떤 키 조합이든
     * 전역 일관된 수치 순서로 획득해 순서 역전 자체를 제거한다. 같은 키를 두 번 넘기면
     * DISTINCT 가 1개 lock 으로 축약한다(단일 키 경로 공용).
     *
     * <p>{@code count(*)} 래핑으로 결과를 항상 단일 행으로 만든다 — void 반환 native query 는
     * single-result 로 실행되어 2-lock(2행) 시 IncorrectResultSizeDataAccessException 이
     * 발생한다(IT 실측). {@code pg_advisory_xact_lock} 은 volatile 이라 count 하위 subquery
     * 에서도 행별·정렬순으로 실제 평가된다(fresh PostgreSQL 16 psql 프로브로 lock 2건
     * 보유·동일 키 dedup 1건 확인).
     *
     * @return 획득한 advisory lock 수 (1 또는 2) — 호출부는 무시한다
     */
    @Query(value = """
            SELECT count(*)
              FROM (SELECT pg_advisory_xact_lock(lock_id)
                      FROM (SELECT DISTINCT hashtextextended(k, 0) AS lock_id
                              FROM (VALUES (CAST(:firstKey AS text)), (CAST(:secondKey AS text))) AS keys(k)
                             ORDER BY lock_id) AS ordered_locks) AS acquired
            """, nativeQuery = true)
    long acquireNormalizedNameAdvisoryLocks(@Param("firstKey") String firstKey,
                                            @Param("secondKey") String secondKey);

    /**
     * 매핑 id 의 현재 normalized key 를 entity 로드 없이 조회한다 — #810 적대검증 R3 (L3-L1).
     *
     * <p>deleteById 가 advisory lock 을 <b>엔티티 로드 전에</b> 획득할 수 있도록 native scalar
     * 로 제공한다(soft-deleted 행 포함 — {@code @SQLRestriction} 우회).
     */
    @Query(value = """
            SELECT normalized_name FROM bank_depositor_partner_mapping
             WHERE id = :mappingId
            """, nativeQuery = true)
    String findNormalizedNameById(@Param("mappingId") UUID mappingId);
}
