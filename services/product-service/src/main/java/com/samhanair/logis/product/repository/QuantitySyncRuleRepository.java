package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncRule;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 수량 동기화 규칙 active aggregate 조회 저장소. */
public interface QuantitySyncRuleRepository extends JpaRepository<QuantitySyncRule, UUID> {

    Optional<QuantitySyncRule> findByRuleKeyAndIsDeletedFalse(String ruleKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from QuantitySyncRule r where r.ruleKey = :ruleKey and r.isDeleted = false")
    Optional<QuantitySyncRule> findByRuleKeyForUpdate(@Param("ruleKey") String ruleKey);

    List<QuantitySyncRule> findAllByIsDeletedFalseOrderByPriorityAscRuleKeyAsc();

    List<QuantitySyncRule> findAllByEstimateCategoryAndIsDeletedFalseOrderByPriorityAscRuleKeyAsc(
            QuantitySyncEstimateCategory estimateCategory);
}
