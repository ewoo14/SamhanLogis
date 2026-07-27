package com.samhanair.logis.product.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 독립 최상위 품목 간 수량 동기화 규칙 aggregate root.
 *
 * <p>Product UUID는 내부 FK로만 사용되는 source/target 행에 보관하며, 이 entity 자체는
 * evaluator를 호출하지 않는다. 따라서 이 slice의 저장은 견적·주문 계산 경로를 변경하지 않는다.
 */
@Entity
@Getter
@Table(name = "quantity_sync_rule")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class QuantitySyncRule extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "rule_key", nullable = false, length = 100)
    private String ruleKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "estimate_category", nullable = false, length = 20)
    private QuantitySyncEstimateCategory estimateCategory;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Enumerated(EnumType.STRING)
    @Column(name = "aggregation", nullable = false, length = 16)
    private QuantitySyncAggregation aggregation;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "condition_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode conditionJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "inactive_behavior", nullable = false, length = 16)
    private QuantitySyncInactiveBehavior inactiveBehavior;

    @Enumerated(EnumType.STRING)
    @Column(name = "conflict_policy", nullable = false, length = 16)
    private QuantitySyncConflictPolicy conflictPolicy;

    @Column(name = "priority", nullable = false)
    private int priority;

    @Column(name = "legacy_ref", nullable = false, length = 255)
    private String legacyRef;

    private QuantitySyncRule(String ruleKey, QuantitySyncEstimateCategory estimateCategory,
                             String name, boolean enabled, QuantitySyncAggregation aggregation,
                             JsonNode conditionJson, QuantitySyncInactiveBehavior inactiveBehavior,
                             QuantitySyncConflictPolicy conflictPolicy, int priority,
                             String legacyRef) {
        this.ruleKey = ruleKey;
        this.estimateCategory = estimateCategory;
        this.name = name;
        this.enabled = enabled;
        this.aggregation = aggregation;
        this.conditionJson = conditionJson;
        this.inactiveBehavior = inactiveBehavior;
        this.conflictPolicy = conflictPolicy;
        this.priority = priority;
        this.legacyRef = legacyRef;
    }

    /** 신규 규칙을 생성한다. 세부 불변식은 service validator가 전체 graph와 함께 검사한다. */
    public static QuantitySyncRule create(String ruleKey, QuantitySyncEstimateCategory estimateCategory,
                                          String name, boolean enabled, QuantitySyncAggregation aggregation,
                                          JsonNode conditionJson, QuantitySyncInactiveBehavior inactiveBehavior,
                                          QuantitySyncConflictPolicy conflictPolicy, int priority,
                                          String legacyRef) {
        if (ruleKey == null || ruleKey.isBlank()) throw new IllegalArgumentException("ruleKey 필수");
        if (estimateCategory == null) throw new IllegalArgumentException("estimateCategory 필수");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name 필수");
        if (aggregation == null) throw new IllegalArgumentException("aggregation 필수");
        if (conditionJson == null) throw new IllegalArgumentException("conditionJson 필수");
        if (inactiveBehavior == null) throw new IllegalArgumentException("inactiveBehavior 필수");
        if (conflictPolicy == null) throw new IllegalArgumentException("conflictPolicy 필수");
        if (priority < 0) throw new IllegalArgumentException("priority는 0 이상");
        if (legacyRef == null || legacyRef.isBlank()) throw new IllegalArgumentException("legacyRef 필수");
        return new QuantitySyncRule(ruleKey, estimateCategory, name, enabled, aggregation, conditionJson,
                inactiveBehavior, conflictPolicy, priority, legacyRef);
    }

    /** rule 정의를 도메인 메서드 chain으로 교체한다. ruleKey는 안정 추적 키이므로 유지한다. */
    public void changeDefinition(QuantitySyncEstimateCategory estimateCategory, String name, boolean enabled,
                                 QuantitySyncAggregation aggregation, JsonNode conditionJson,
                                 QuantitySyncInactiveBehavior inactiveBehavior,
                                 QuantitySyncConflictPolicy conflictPolicy, int priority, String legacyRef) {
        this.estimateCategory = estimateCategory;
        this.name = name;
        this.enabled = enabled;
        this.aggregation = aggregation;
        this.conditionJson = conditionJson;
        this.inactiveBehavior = inactiveBehavior;
        this.conflictPolicy = conflictPolicy;
        this.priority = priority;
        this.legacyRef = legacyRef;
    }
}
