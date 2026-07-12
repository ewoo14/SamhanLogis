package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.PriceHistory;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** PriceHistory CRUD + effectiveDate 기준 최신 단가 조회. */
public interface PriceHistoryRepository extends JpaRepository<PriceHistory, UUID> {

    List<PriceHistory> findByProductIdOrderByEffectiveDateDesc(UUID productId);

    Optional<PriceHistory> findByProductIdAndEffectiveDate(UUID productId, LocalDate effectiveDate);

    boolean existsByProductIdAndEffectiveDate(UUID productId, LocalDate effectiveDate);

    /** #30 — 인상 전(2000-01-01) 단가 baseline 벌크. */
    List<PriceHistory> findByEffectiveDate(LocalDate effectiveDate);

    /** 견적일 기준 가장 최근 가격 row (effective_date <= asOf). */
    @Query("SELECT ph FROM PriceHistory ph WHERE ph.productId = :productId "
            + "AND ph.effectiveDate <= :asOf ORDER BY ph.effectiveDate DESC")
    List<PriceHistory> findApplicable(@Param("productId") UUID productId,
                                      @Param("asOf") LocalDate asOf);

    default Optional<PriceHistory> findApplicableLatest(UUID productId, LocalDate asOf) {
        List<PriceHistory> rows = findApplicable(productId, asOf);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}
