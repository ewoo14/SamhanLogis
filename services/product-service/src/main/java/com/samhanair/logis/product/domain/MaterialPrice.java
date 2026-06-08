package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 자재 단가 마스터 — 싱글 자재가격 시트 row 2~29 (28 row 시드).
 *
 * <p>출처: Migration Plan §2.1.4. materialKey = D2 (유선리모컨), D4 (자재 합계 master),
 * D7/D8 (자재 미포함/포함) 등.
 */
@Entity
@Getter
@Table(name = "material_price")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class MaterialPrice extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 싱글 자재가격 시트의 D 열 row 인덱스 (D2/D3/.../D29). */
    @Column(name = "material_key", nullable = false, length = 8)
    private String materialKey;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Column(name = "price", nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    /** C열 옵션 (유선선택/판넬선택/합계 등). */
    @Column(name = "option_label", length = 64)
    private String optionLabel;

    /** D열 수식 보존 (=IF($D$4>400000,$B$7,0) 등). */
    @Column(name = "computed_formula", columnDefinition = "TEXT")
    private String computedFormula;

    private MaterialPrice(String materialKey, String name, BigDecimal price,
                          String optionLabel, String computedFormula) {
        this.materialKey = materialKey;
        this.name = name;
        this.price = price;
        this.optionLabel = optionLabel;
        this.computedFormula = computedFormula;
    }

    public static MaterialPrice seed(String materialKey, String name, BigDecimal price,
                                     String optionLabel, String computedFormula) {
        if (materialKey == null || materialKey.isBlank())
            throw new IllegalArgumentException("materialKey 필수");
        if (name == null || name.isBlank())
            throw new IllegalArgumentException("name 필수");
        return new MaterialPrice(materialKey, name,
                price == null ? BigDecimal.ZERO : price, optionLabel, computedFormula);
    }

    /**
     * 시트 sync update — materialKey natural key 는 유지하고 시트 실값 컬럼만 갱신한다.
     *
     * @param name A열 품명
     * @param price B열 가격
     * @param optionLabel C열 옵션 라벨, 시트 무값이면 null
     * @param computedFormula D열 계산값, 시트 무값이면 null
     */
    public void updateFromSheet(String name, BigDecimal price, String optionLabel, String computedFormula) {
        if (name == null || name.isBlank())
            throw new IllegalArgumentException("name 필수");
        this.name = name;
        this.price = price == null ? BigDecimal.ZERO : price;
        this.optionLabel = optionLabel;
        this.computedFormula = computedFormula;
    }
}
