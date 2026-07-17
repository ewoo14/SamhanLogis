package com.samhanair.logis.accounting.audit.repository;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 회계 도메인 audit overlay log — entityId 기반 조회 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>soft-delete 자동 제외 ({@code @SQLRestriction}). FE timeline UI 는
 * {@link #findByEntityIdOrderByRevisionNoDescChangedAtDesc} 결과를 그대로 표시 (최신 revision
 * 우선). UUID 비공개 가드 — 응답 actorId 는 FE 색상 hash 결정성용, 화면 표시는 actorName.
 */
public interface AccountingAuditLogRepository extends JpaRepository<AccountingAuditLog, UUID> {

    /** entity 별 audit log — 최신 revision 우선 (FE timeline 기본 정렬). */
    List<AccountingAuditLog> findByEntityIdOrderByRevisionNoDescChangedAtDesc(UUID entityId);

    /** 특정 entity + revision 의 audit row (다중 필드 변경 시 N row). */
    List<AccountingAuditLog> findByEntityIdAndRevisionNo(UUID entityId, int revisionNo);

    /**
     * 정규화 키가 old/new 로 등장한 매핑 entityId 수집 — #810 적대검증 R1 (L4-H2/L6-H1).
     *
     * <p>rename 으로 현재 키가 바뀐 매핑도 과거 키 조회에서 추적할 수 있도록
     * {@code mapping.normalizedName} 감사행에서 entityId 를 역추적한다.
     */
    @Query("""
            select distinct log.entityId from AccountingAuditLog log
             where log.fieldName = 'mapping.normalizedName'
               and (log.oldValue = :normalizedName or log.newValue = :normalizedName)
            """)
    List<UUID> findMappingEntityIdsByNormalizedName(
            @Param("normalizedName") String normalizedName);

    /**
     * 매핑 entityId 기준 전 필드 audit 행 조회 — #810 적대검증 R1 (L4-H2/L6-H1).
     *
     * <p>normalizedName 행만 필터하던 구 쿼리는 partnerCode/rawName/사유 행을 절대 노출하지 못했고
     * rename 시 이전 이력이 절단됐다. entityId 기준 전 필드 행으로 전환해 rename 후에도
     * 같은 매핑의 이력이 연속된다. {@code mapping.%} prefix 가드는 UUID 충돌 방어 겸 의도 문서화.
     *
     * <p>#810 R3-CODEX (S4-M3) — 구 정렬(changedAt/revisionNo/fieldName)은 total order 가
     * 아니어서(같은 작업의 행들이 timestamp·revision 을 공유, soft-delete 후 재생성 entity 간
     * 동률 가능) 호출 간 순서가 흔들릴 수 있었다. entityId·id tie-breaker 로 안정(total) 정렬을
     * 보장한다 — FE 목록 렌더 순서·React key 안정성의 전제.
     */
    @Query("""
            select log from AccountingAuditLog log
             where log.entityId in :entityIds
               and log.fieldName like 'mapping.%'
             order by log.changedAt desc, log.revisionNo desc,
                      log.entityId asc, log.fieldName asc, log.id asc
            """)
    List<AccountingAuditLog> findMappingHistoryByEntityIds(
            @Param("entityIds") java.util.Collection<UUID> entityIds);
}
