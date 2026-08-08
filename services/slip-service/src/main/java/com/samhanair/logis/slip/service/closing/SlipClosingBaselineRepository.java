package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.slip.domain.SlipType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SlipClosingBaselineRepository extends JpaRepository<SlipClosingBaseline, UUID> {
    Optional<SlipClosingBaseline> findBySlipTypeAndIsDeletedFalse(SlipType slipType);

    java.util.List<SlipClosingBaseline> findAllByIsDeletedFalseOrderBySlipTypeAsc();
}
