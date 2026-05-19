package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 이카운트 품목 alias_code → 대표 Product N:1 매핑. */
@Entity
@Getter
@Table(name = "product_aliases")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ProductAlias extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "alias_code", nullable = false, length = 100)
    private String aliasCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "main_product_id", nullable = false)
    private Product mainProduct;

    @Column(name = "source", nullable = false, length = 30)
    private String source;

    private ProductAlias(String aliasCode, Product mainProduct, String source) {
        this.aliasCode = aliasCode;
        this.mainProduct = mainProduct;
        this.source = source;
    }

    public static ProductAlias create(String aliasCode, Product mainProduct, String source) {
        return new ProductAlias(aliasCode, mainProduct, source == null ? "ECOUNT_IMPORT" : source);
    }

    public void remap(Product mainProduct, String source) {
        this.mainProduct = mainProduct;
        if (source != null && !source.isBlank()) {
            this.source = source;
        }
    }
}
