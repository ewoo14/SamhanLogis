package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
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
 * 가격 history — 마스터 충돌 4건 해소 (G3 결정) + PRICE_INC_DATE (2026-04-01) 분기.
 *
 * <p>출처: Migration Plan §2.1.2. 단가 조회 시 effectiveDate <= 견적일 중 가장 최근 row 채택.
 *
 * <p>시드 룰: ProductMaster 1건 당 PriceHistory 2 row (베이스 → effectiveDate=과거,
 * 인상본 → effectiveDate=2026-04-01).
 */
@Entity
@Getter
@Table(name = "price_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PriceHistory extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** ProductMaster.id (FK). */
    @Column(name = "product_id", nullable = false)
    private UUID productId;

    /** 시점별 가격 적용 시작일 (베이스 = 과거 / 인상본 = 2026-04-01). */
    @Column(name = "effective_date", nullable = false)
    private LocalDate effectiveDate;

    @Column(name = "release_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal releasePrice;

    @Column(name = "delivery_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal deliveryPrice;

    /** 시점별로 자재가격 master cell 변경 가능 (D4/D7/D8). */
    @Enumerated(EnumType.STRING)
    @Column(name = "set_material_key", length = 2)
    private MaterialKey setMaterialKey;

    private PriceHistory(UUID productId, LocalDate effectiveDate,
                         BigDecimal releasePrice, BigDecimal deliveryPrice,
                         MaterialKey setMaterialKey) {
        this.productId = productId;
        this.effectiveDate = effectiveDate;
        this.releasePrice = releasePrice;
        this.deliveryPrice = deliveryPrice;
        this.setMaterialKey = setMaterialKey;
    }

    /** Phase 6 M1a 시드 factory. */
    public static PriceHistory seed(UUID productId, LocalDate effectiveDate,
                                    BigDecimal releasePrice, BigDecimal deliveryPrice,
                                    MaterialKey setMaterialKey) {
        if (productId == null) throw new IllegalArgumentException("productId 필수");
        if (effectiveDate == null) throw new IllegalArgumentException("effectiveDate 필수");
        if (releasePrice == null || releasePrice.signum() < 0)
            throw new IllegalArgumentException("releasePrice 0 이상 필수");
        if (deliveryPrice == null || deliveryPrice.signum() < 0)
            throw new IllegalArgumentException("deliveryPrice 0 이상 필수");
        return new PriceHistory(productId, effectiveDate, releasePrice, deliveryPrice, setMaterialKey);
    }

    /** 시트 재동기화 시 같은 effectiveDate row 의 단가를 갱신한다. */
    public void changePrices(BigDecimal releasePrice, BigDecimal deliveryPrice) {
        if (releasePrice == null || releasePrice.signum() < 0) {
            throw new IllegalArgumentException("releasePrice 0 이상 필수");
        }
        if (deliveryPrice == null || deliveryPrice.signum() < 0) {
            throw new IllegalArgumentException("deliveryPrice 0 이상 필수");
        }
        this.releasePrice = releasePrice;
        this.deliveryPrice = deliveryPrice;
    }
}
