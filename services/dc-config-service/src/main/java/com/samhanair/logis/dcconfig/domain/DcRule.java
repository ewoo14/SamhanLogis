package com.samhanair.logis.dcconfig.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 카테고리/모델 prefix 단위 DC 룰 (확장).
 *
 * <p>Partner FK NULL = 모든 거래처 공통 룰 (GLOBAL). priority 작을수록 먼저 적용.
 * effective 범위는 inclusive ({@code effectiveFrom <= today <= effectiveTo}).
 *
 * <p>DcConfig 의 16 컬럼으로 표현 못 하는 케이스 (특정 모델만 추가 % 차감 등) 를
 * 본 entity 로 보강. legacy CFG_RAW 222 row 1차 시드는 DcConfig 만, 본 entity 는
 * 운영 중 admin UI 추가 기능.
 */
@Entity
@Getter
@Table(name = "dc_rules")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DcRule extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** NULL = 모든 거래처 공통 GLOBAL 룰. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private Partner partner;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false, length = 20)
    private DcRuleType ruleType;

    /** {@link DcRuleType#MODEL_PREFIX} 인 경우 prefix (예: "AJ040"). */
    @Column(name = "model_prefix_pattern", length = 64)
    private String modelPrefixPattern;

    /** {@link DcRuleType#CATEGORY} 인 경우 카테고리 코드 (HOMEMULTI / COMMERCIAL_MULTI / OTHER). */
    @Column(name = "category_code", length = 30)
    private String categoryCode;

    /** GLOBAL_RATE / MODEL_PREFIX (rate) / CATEGORY (rate) 의 차감율 (0~1). */
    @Column(name = "discount_rate", precision = 5, scale = 4)
    private BigDecimal discountRate;

    /** FIXED_AMOUNT 의 정액 차감. */
    @Column(name = "discount_amount", precision = 12, scale = 2)
    private BigDecimal discountAmount;

    /** 적용 우선순위 (작을수록 먼저). default 100. */
    @Column(name = "priority", nullable = false)
    private int priority = 100;

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    private DcRule(Partner partner, DcRuleType ruleType, String modelPrefixPattern,
                   String categoryCode, BigDecimal discountRate, BigDecimal discountAmount,
                   int priority, LocalDate effectiveFrom, LocalDate effectiveTo, String note) {
        this.partner = partner;
        this.ruleType = ruleType;
        this.modelPrefixPattern = modelPrefixPattern;
        this.categoryCode = categoryCode;
        this.discountRate = discountRate;
        this.discountAmount = discountAmount;
        this.priority = priority;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.note = note;
    }

    public static DcRule createGlobalRate(Partner partner, BigDecimal rate, int priority,
                                          LocalDate from, LocalDate to, String note) {
        validateRate(rate);
        return new DcRule(partner, DcRuleType.GLOBAL_RATE, null, null, rate, null,
                priority, from, to, note);
    }

    public static DcRule createFixedAmount(Partner partner, BigDecimal amount, int priority,
                                           LocalDate from, LocalDate to, String note) {
        validateAmount(amount);
        return new DcRule(partner, DcRuleType.FIXED_AMOUNT, null, null, null, amount,
                priority, from, to, note);
    }

    public static DcRule createModelPrefix(Partner partner, String prefix, BigDecimal rate,
                                           BigDecimal amount, int priority,
                                           LocalDate from, LocalDate to, String note) {
        if (prefix == null || prefix.isBlank()) {
            throw new IllegalArgumentException("modelPrefixPattern 은 필수입니다");
        }
        if ((rate == null) == (amount == null)) {
            throw new IllegalArgumentException("MODEL_PREFIX 룰은 rate 또는 amount 중 정확히 1개 필요");
        }
        if (rate != null) validateRate(rate);
        if (amount != null) validateAmount(amount);
        return new DcRule(partner, DcRuleType.MODEL_PREFIX, prefix.trim(), null, rate, amount,
                priority, from, to, note);
    }

    public static DcRule createCategory(Partner partner, String categoryCode, BigDecimal rate,
                                        int priority, LocalDate from, LocalDate to, String note) {
        if (categoryCode == null || categoryCode.isBlank()) {
            throw new IllegalArgumentException("categoryCode 는 필수입니다");
        }
        validateRate(rate);
        return new DcRule(partner, DcRuleType.CATEGORY, null, categoryCode.trim(), rate, null,
                priority, from, to, note);
    }

    public boolean isEffectiveOn(LocalDate date) {
        if (date == null) return true;
        if (effectiveFrom != null && date.isBefore(effectiveFrom)) return false;
        if (effectiveTo != null && date.isAfter(effectiveTo)) return false;
        return true;
    }

    public void changePriority(int priority) {
        this.priority = priority;
    }

    public void changeEffectiveRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new IllegalArgumentException("effectiveTo 는 effectiveFrom 이후여야 합니다");
        }
        this.effectiveFrom = from;
        this.effectiveTo = to;
    }

    public void changeNote(String note) {
        this.note = note;
    }

    private static void validateRate(BigDecimal rate) {
        if (rate == null || rate.signum() < 0 || rate.compareTo(BigDecimal.ONE) >= 0) {
            throw new IllegalArgumentException("rate 는 0 이상 1 미만이어야 합니다");
        }
    }

    private static void validateAmount(BigDecimal amount) {
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException("amount 는 0 이상이어야 합니다");
        }
    }
}
