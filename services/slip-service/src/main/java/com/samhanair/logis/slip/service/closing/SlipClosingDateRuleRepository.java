package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SlipClosingDateRuleRepository extends JpaRepository<SlipClosingDateRule, UUID> {
    Optional<SlipClosingDateRule> findBySlipTypeAndClosingDateAndIsDeletedFalse(
            SlipType slipType, LocalDate closingDate);
}
