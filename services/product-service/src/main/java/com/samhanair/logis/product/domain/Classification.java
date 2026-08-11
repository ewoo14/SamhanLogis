package com.samhanair.logis.product.domain;

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
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 견적 품목 분류 마스터.
 *
 * <p>EstimateCategory 탭마다 독립된 L/M/S 3단계 트리를 가진다. 삭제는 BaseEntity
 * soft-delete 만 허용하며, 품목이 참조 중인 분류는 서비스 계층에서 삭제를 차단한다.
 */
@Entity
@Getter
@Table(name = "classification")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Classification extends BaseEntity {

    /** 분류 계층 단계. */
    public enum CatLevel {
        L,
        M,
        S
    }

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "estimate_category", nullable = false, length = 20)
    private EstimateCategory estimateCategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "cat_level", nullable = false, length = 1)
    private CatLevel catLevel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Classification parent;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    /** 품목 분류별 정액DC율(퍼센트). null 이면 해당 단계에서 미지정이다. */
    @Column(name = "fixed_discount_rate", precision = 5, scale = 2)
    private BigDecimal fixedDiscountRate;

    private Classification(EstimateCategory estimateCategory, CatLevel catLevel, Classification parent,
                           String name, int displayOrder, boolean active) {
        this.estimateCategory = estimateCategory;
        this.catLevel = catLevel;
        this.parent = parent;
        this.name = normalizeName(name);
        this.displayOrder = displayOrder;
        this.active = active;
    }

    /**
     * 신규 분류를 생성한다.
     *
     * @param estimateCategory 견적 카테고리
     * @param catLevel L/M/S 단계
     * @param parent 상위 분류. L은 null, M은 L, S는 M
     * @param name 화면 표시명
     * @param displayOrder 같은 부모 아래 표시 순서
     * @param active 사용 여부
     * @return 신규 분류
     */
    public static Classification create(EstimateCategory estimateCategory, CatLevel catLevel,
                                        Classification parent, String name, int displayOrder,
                                        boolean active) {
        if (estimateCategory == null) {
            throw new IllegalArgumentException("견적 카테고리는 필수입니다");
        }
        if (catLevel == null) {
            throw new IllegalArgumentException("분류 단계는 필수입니다");
        }
        return new Classification(estimateCategory, catLevel, parent, name, displayOrder, active);
    }

    public void rename(String name) {
        this.name = normalizeName(name);
    }

    public void changeParent(Classification parent) {
        this.parent = parent;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public void changeActive(boolean active) {
        this.active = active;
    }

    /** 분류별 정액DC율을 변경한다. null 은 해당 단계의 정책을 해제한다. */
    public void changeFixedDiscountRate(BigDecimal fixedDiscountRate) {
        if (fixedDiscountRate != null
                && (fixedDiscountRate.compareTo(BigDecimal.ZERO) < 0
                || fixedDiscountRate.compareTo(new BigDecimal("100.00")) > 0)) {
            throw new IllegalArgumentException("고정DC율은 0 이상 100 이하이어야 합니다");
        }
        this.fixedDiscountRate = fixedDiscountRate;
    }

    private static String normalizeName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("분류명은 필수입니다");
        }
        return name.trim();
    }
}
