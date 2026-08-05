package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProductSummaryResponseTest {

    @Test
    void from_includesProductSpecificationForSearchModal() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.getSpecification()).thenReturn("13평형 / R32 / 인버터");

        ProductSummaryResponse response = ProductSummaryResponse.from(product);

        assertThat(response.specification()).isEqualTo("13평형 / R32 / 인버터");
    }

    @Test
    void from_derivesHomeMultiCategoryKeyFromPhysicalCategoryWhenProductCategoryIsNull() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(category.getCode()).thenReturn("INDOOR_WALL");
        when(product.getProductCategory()).thenReturn(null);

        ProductSummaryResponse response = ProductSummaryResponse.from(product);

        assertThat(response.categoryKey()).isEqualTo("homemulti");
    }
}
