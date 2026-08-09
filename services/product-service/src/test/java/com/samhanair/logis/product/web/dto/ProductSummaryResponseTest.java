package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductGoodsType;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    void from_includesGoodsTypeForEstimateSearch() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.getGoodsType()).thenReturn(ProductGoodsType.NON_GOODS);

        ProductSummaryResponse response = ProductSummaryResponse.from(product);

        assertThat(response.goodsType()).isEqualTo(ProductGoodsType.NON_GOODS);
    }

    @Test
    void goodsType_isSerializedInSearchResponseContract() throws Exception {
        ProductSummaryResponse response = new ProductSummaryResponse(
                UUID.randomUUID(), "비상품", "NON-GOODS-001", UUID.randomUUID(),
                null, null);

        assertThat(new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(response))
                .get("goodsType").asText()).isEqualTo("GOODS");
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

    @Test
    void from_preservesVariableDiscountEligibilitySeparatelyFromDerivedCategoryKey() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(category.getCode()).thenReturn("INDOOR_WALL");
        when(product.getProductCategory()).thenReturn(null);
        when(product.getHasVariableDiscount()).thenReturn(false);

        ProductSummaryResponse response = ProductSummaryResponse.from(product);

        assertThat(response.categoryKey()).isEqualTo("homemulti");
        assertThat(response.hasVariableDiscount()).isFalse();
    }
}
