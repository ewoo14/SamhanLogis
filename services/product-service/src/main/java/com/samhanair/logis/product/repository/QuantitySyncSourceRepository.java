package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.QuantitySyncSource;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 수량 동기화 규칙 source 행 저장소. */
public interface QuantitySyncSourceRepository extends JpaRepository<QuantitySyncSource, UUID> {

    List<QuantitySyncSource> findAllByRuleIdAndIsDeletedFalseOrderById(UUID ruleId);
}
