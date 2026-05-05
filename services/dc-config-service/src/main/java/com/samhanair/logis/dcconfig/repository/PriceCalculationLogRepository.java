package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.PriceCalculationLog;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 감사 로그 — write only at compute time, read by 감사/디버그 query. */
public interface PriceCalculationLogRepository extends JpaRepository<PriceCalculationLog, UUID> {
}
