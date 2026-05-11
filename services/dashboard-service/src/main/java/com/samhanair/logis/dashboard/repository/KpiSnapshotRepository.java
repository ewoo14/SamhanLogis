package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.KpiCategory;
import com.samhanair.logis.dashboard.domain.KpiSnapshot;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * KPI 스냅샷 저장소 — 카테고리 / 날짜 범위 조회.
 */
@Repository
public interface KpiSnapshotRepository extends JpaRepository<KpiSnapshot, UUID> {

    Optional<KpiSnapshot> findFirstByCategoryAndSnapshotDate(KpiCategory category, LocalDate snapshotDate);

    List<KpiSnapshot> findAllByCategoryAndSnapshotDateBetweenOrderBySnapshotDateAsc(
            KpiCategory category, LocalDate from, LocalDate to);

    List<KpiSnapshot> findAllBySnapshotDateBetweenOrderBySnapshotDateAsc(LocalDate from, LocalDate to);

    /** Seeder idempotent — partial unique (snapshot_date, category) 충돌 회피. */
    boolean existsBySnapshotDateAndCategory(LocalDate snapshotDate, KpiCategory category);
}
