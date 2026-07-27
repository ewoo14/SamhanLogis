package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.QuantitySyncTarget;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 수량 동기화 규칙 target 행 저장소. */
public interface QuantitySyncTargetRepository extends JpaRepository<QuantitySyncTarget, UUID> {

    List<QuantitySyncTarget> findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(UUID ruleId);
}
