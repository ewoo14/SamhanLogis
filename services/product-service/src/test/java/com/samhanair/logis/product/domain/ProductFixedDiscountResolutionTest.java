package com.samhanair.logis.product.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.web.dto.ProductCatalogResponse;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProductFixedDiscountResolutionTest {

    @Test
    void 분류값은_L보다_M보다_S가_우선한다() {
        Classification l = classification(new BigDecimal("5"));
        Classification m = classification(new BigDecimal("10"));
        Classification s = classification(new BigDecimal("15"));
        Product product = product(new BigDecimal("7.50"));
        product.changeClassifications(l, m, s);

        assertEquals(new BigDecimal("15"), product.resolveFixedDiscount().rate());
        assertEquals(Product.FixedDiscountSource.S, product.resolveFixedDiscount().source());

        product.changeClassifications(l, m, null);
        assertEquals(new BigDecimal("10"), product.resolveFixedDiscount().rate());
        assertEquals(Product.FixedDiscountSource.M, product.resolveFixedDiscount().source());

        product.changeClassifications(l, null, null);
        assertEquals(new BigDecimal("5"), product.resolveFixedDiscount().rate());
        assertEquals(Product.FixedDiscountSource.L, product.resolveFixedDiscount().source());
    }

    @Test
    void 품목별_수동_override는_분류값보다_우선한다() {
        Product product = product(new BigDecimal("7.50"));
        product.changeClassifications(null, null, classification(new BigDecimal("15")));
        product.markFixedDiscountManual(new BigDecimal("2.50"));

        assertEquals(new BigDecimal("2.50"), product.resolveFixedDiscount().rate());
        assertEquals(Product.FixedDiscountSource.PRODUCT, product.resolveFixedDiscount().source());
    }

    @Test
    void 분류값이_없으면_기존_품목값과_출처를_그대로_보존한다() {
        Product product = product(new BigDecimal("7.50"));

        assertEquals(new BigDecimal("7.50"), product.resolveFixedDiscount().rate());
        assertEquals(Product.FixedDiscountSource.PRODUCT, product.resolveFixedDiscount().source());
    }

    @Test
    void 카탈로그_응답에_적용_출처가_포함된다() {
        Product product = product(null);
        product.changeClassifications(null, null, classification(new BigDecimal("15")));

        ProductCatalogResponse response = ProductCatalogResponse.from(product);

        assertEquals(new BigDecimal("15"), response.fixedDiscountRate());
        assertEquals("S", response.fixedDiscountSource());
    }

    private static Product product(BigDecimal fixedDiscountRate) {
        Product product = Product.create(
                "테스트 품목", "TEST-001", null, BigDecimal.ZERO, BigDecimal.ZERO, "KRW", null, null);
        if (fixedDiscountRate != null) {
            product.changeFixedDiscountRate(fixedDiscountRate);
        }
        return product;
    }

    private static Classification classification(BigDecimal fixedDiscountRate) {
        Classification classification = mock(Classification.class);
        when(classification.getId()).thenReturn(UUID.randomUUID());
        when(classification.getName()).thenReturn("테스트 분류");
        when(classification.getFixedDiscountRate()).thenReturn(fixedDiscountRate);
        return classification;
    }
}
