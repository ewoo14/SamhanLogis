package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.SalesAggregate;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * 매출 집계 저장소 — 일자 / 거래처 lookup.
 */
@Repository
public interface SalesAggregateRepository extends JpaRepository<SalesAggregate, UUID> {

    Optional<SalesAggregate> findFirstByAggregateDateAndPartnerId(LocalDate aggregateDate, UUID partnerId);

    List<SalesAggregate> findAllByAggregateDateBetweenOrderByAggregateDateAsc(LocalDate from, LocalDate to);

    List<SalesAggregate> findAllByPartnerIdAndAggregateDateBetweenOrderByAggregateDateAsc(
            UUID partnerId, LocalDate from, LocalDate to);

    /** Seeder idempotent — partial unique (aggregate_date, partner_id) 충돌 회피. */
    boolean existsByAggregateDateAndPartnerId(LocalDate aggregateDate, UUID partnerId);
}
