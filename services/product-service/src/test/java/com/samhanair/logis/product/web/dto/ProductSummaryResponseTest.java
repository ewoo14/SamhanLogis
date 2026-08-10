package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.UsageScope;
import java.util.List;
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
    void from_nonGoods_isSerializedAsNonGoodsInSearchResponseContract() throws Exception {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.getGoodsType()).thenReturn(ProductGoodsType.NON_GOODS);

        ProductSummaryResponse response = ProductSummaryResponse.from(product);
        String json = new ObjectMapper().writeValueAsString(response);

        assertThat(new ObjectMapper().readTree(json).get("goodsType")).isNotNull();
        assertThat(new ObjectMapper().readTree(json).get("goodsType").asText())
                .isEqualTo("NON_GOODS");
    }

    @Test
    void from_withExposures_serializesSearchMetadataWithoutRequeryShape() throws Exception {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        UUID productId = UUID.randomUUID();
        when(product.getId()).thenReturn(productId);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.getUsageScope()).thenReturn(UsageScope.ESTIMATE);
        when(product.getProductCategory()).thenReturn(ProductCategory.SINGLE_PART);
        when(product.getGoodsType()).thenReturn(ProductGoodsType.NON_GOODS);

        ProductSummaryResponse response = ProductSummaryResponse.from(product, List.of(
                ProductEstimateExposure.create(productId, EstimateCategory.HOME_MULTI, 3),
                ProductEstimateExposure.create(productId, EstimateCategory.SINGLE_SET, 4)));

        var json = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(response));
        assertThat(json.get("usageScope").asText()).isEqualTo("ESTIMATE");
        assertThat(json.get("estimateCategories").toString())
                .isEqualTo("[\"HOME_MULTI\",\"SINGLE_SET\"]");
        assertThat(json.get("goodsType").asText()).isEqualTo("NON_GOODS");
        assertThat(json.get("productCategory").asText()).isEqualTo("SINGLE_PART");
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

    @Test
    void from_includesResolvedFixedDiscountSourceForEstimateLookup() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.resolveFixedDiscount()).thenReturn(
                new Product.FixedDiscountResolution(new java.math.BigDecimal("15"), Product.FixedDiscountSource.S));

        ProductSummaryResponse response = ProductSummaryResponse.from(product);

        assertThat(response.fixedDiscountRate()).isEqualByComparingTo("15");
        assertThat(response.fixedDiscountSource()).isEqualTo("S");
    }
}
