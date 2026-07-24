package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.Warehouse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Soft-delete 는 {@link Warehouse @SQLRestriction} 으로 엔티티 레벨에서 처리한다. */
public interface WarehouseRepository extends JpaRepository<Warehouse, UUID> {

    List<Warehouse> findAllByIsDeletedFalseOrderByDisplayOrderAsc();

    boolean existsByCodeAndIsDeletedFalse(String code);

    Optional<Warehouse> findByCode(String code);

    /**
     * Phase 10 P0-5 — admin 창고 페이지 조회 (q 필터).
     *
     * <p>q 는 code / name / address LIKE (대소문자 무시). null/blank 시 필터 미적용.
     * is_deleted=false 활성 행만 반환 (entity {@code @SQLRestriction} 의존).
     */
    @Query("SELECT w FROM Warehouse w WHERE "
            + "(CAST(:q AS string) IS NULL "
            + " OR LOWER(w.code) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(w.name) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(COALESCE(w.address, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' )")
    Page<Warehouse> searchAdmin(@Param("q") String q, Pageable pageable);

    /**
     * 비활성화된(soft-deleted) 창고 목록 — 복구 admin 화면용.
     *
     * <p>{@code @SQLRestriction} 우회를 위해 native query + 결과를 다시 JPA entity 로 hydrate.
     * 표준 JPA 메서드는 항상 활성 행만 반환하므로 명시적 native SELECT 필요.
     */
    @Query(value = "SELECT * FROM warehouses w WHERE w.is_deleted = true "
            + "ORDER BY w.modified_at DESC", nativeQuery = true)
    List<Warehouse> findAllDeleted();

    /**
     * 비활성화된 단건 조회 (복구 시점 검증) — id 기준. {@code @SQLRestriction} 우회.
     */
    @Query(value = "SELECT * FROM warehouses w WHERE w.id = :id AND w.is_deleted = true",
            nativeQuery = true)
    Optional<Warehouse> findDeletedById(@Param("id") UUID id);
}
