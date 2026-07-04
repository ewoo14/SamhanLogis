package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * InventoryAudit 헤더 조회 + audit_no 채번 헬퍼.
 *
 * <p>Soft-delete 는 {@link InventoryAudit @SQLRestriction} 으로 엔티티 레벨 처리.
 */
public interface InventoryAuditRepository extends JpaRepository<InventoryAudit, UUID> {

    /** {@code yyyy/MM/dd-N} 채번용 — 그날 prefix 의 발행 건수 계산. */
    long countByAuditNoStartingWith(String prefix);

    /**
     * 필터 조회 — warehouseId / 연도 / status 모두 nullable. 누락 시 해당 조건 무시.
     *
     * <p>PostgreSQL JDBC 는 {@code (? IS NULL OR ...)} 패턴에서 파라미터 타입 추론에 실패해
     * {@code SQLState 42P18 — could not determine data type of parameter} 를 던진다.
     * 이를 우회하기 위해 boolean flag 파라미터로 NULL 여부를 명시 (CI fix).
     *
     * @param warehouseId 창고 필터 (null 가능)
     * @param fromDate    auditDate 시작 (null 가능)
     * @param toDate      auditDate 종료 (null 가능, inclusive)
     * @param status      상태 필터 (null 가능)
     * @param pageable    페이지 정보
     * @return 필터된 InventoryAudit page
     */
    @Query("""
            SELECT a FROM InventoryAudit a
            WHERE (:hasWarehouse = false OR a.warehouse.id = :warehouseId)
              AND (:hasFromDate = false OR a.auditDate >= :fromDate)
              AND (:hasToDate = false OR a.auditDate <= :toDate)
              AND (:hasStatus = false OR a.status = :status)
            ORDER BY a.auditDate DESC, a.createdAt DESC
            """)
    Page<InventoryAudit> findByFilters(
            @Param("hasWarehouse") boolean hasWarehouse,
            @Param("warehouseId") UUID warehouseId,
            @Param("hasFromDate") boolean hasFromDate,
            @Param("fromDate") LocalDate fromDate,
            @Param("hasToDate") boolean hasToDate,
            @Param("toDate") LocalDate toDate,
            @Param("hasStatus") boolean hasStatus,
            @Param("status") AuditStatus status,
            Pageable pageable);
}
