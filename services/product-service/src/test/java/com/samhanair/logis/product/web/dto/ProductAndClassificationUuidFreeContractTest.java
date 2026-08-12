package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import java.math.BigDecimal;
import java.lang.reflect.RecordComponent;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 사용자 경로 제품·분류 응답에 DB UUID 타입이 직접 노출되지 않는 계약을 고정한다. */
class ProductAndClassificationUuidFreeContractTest {

    @Test
    void publicProductAndClassificationDtos_doNotSerializeRawUuidValues() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Stream.of(
                        ProductResponse.class,
                        ProductSummaryResponse.class,
                        ProductByCodeResponse.class,
                        ProductSpecResponse.class,
                        ClassificationResponse.class,
                        CategoryResponse.class)
                .forEach(type -> {
                    try {
                        RecordComponent[] components = type.getRecordComponents();
                        Object[] args = Stream.of(components)
                                .map(component -> component.getType() == UUID.class
                                        ? UUID.randomUUID() : defaultValue(component.getType()))
                                .toArray();
                        Class<?>[] types = Stream.of(components).map(RecordComponent::getType).toArray(Class<?>[]::new);
                        Object dto = type.getDeclaredConstructor(types).newInstance(args);
                        String json = mapper.writeValueAsString(dto);
                        assertThat(json).as(type.getSimpleName()).doesNotContainPattern(
                                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");
                    } catch (Exception e) {
                        throw new AssertionError(e);
                    }
                });
    }

    @Test
    void productResponse_auditUserUuidIsNeverSerialized() throws Exception {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        UUID createdBy = UUID.randomUUID();
        UUID modifiedBy = UUID.randomUUID();
        when(product.getId()).thenReturn(UUID.randomUUID());
        when(product.getName()).thenReturn("품목");
        when(product.getModelName()).thenReturn("모델");
        when(product.getModelCode()).thenReturn("MODEL-001");
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(category.getName()).thenReturn("분류");
        when(product.getSellingPrice()).thenReturn(BigDecimal.ONE);
        when(product.getPurchasePrice()).thenReturn(BigDecimal.ONE);
        when(product.getCurrency()).thenReturn("KRW");
        when(product.getCreatedBy()).thenReturn(createdBy.toString());
        when(product.getModifiedBy()).thenReturn(modifiedBy.toString());
        when(product.resolveFixedDiscount()).thenReturn(new Product.FixedDiscountResolution(null,
                Product.FixedDiscountSource.NONE));

        ProductResponse response = ProductResponse.from(product);
        String json = new ObjectMapper().writeValueAsString(response);

        assertThat(json).doesNotContainPattern(
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");
    }

    @Test
    void productResponse_preservesAuditInformationAsDisplayNames() {
        Product product = mock(Product.class);
        Category category = mock(Category.class);
        when(product.getCategory()).thenReturn(category);
        when(category.getId()).thenReturn(UUID.randomUUID());
        when(product.resolveFixedDiscount()).thenReturn(new Product.FixedDiscountResolution(null,
                Product.FixedDiscountSource.NONE));

        ProductResponse response = ProductResponse.from(product,
                ProductItemKind.GENERAL, null, null, java.util.List.of(), "작성자 이름", "수정자 이름");

        assertThat(response.createdBy()).isEqualTo("작성자 이름");
        assertThat(response.modifiedBy()).isEqualTo("수정자 이름");
    }

    private static Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) return null;
        if (type == boolean.class) return false;
        if (type == int.class) return 0;
        return 0;
    }
}
