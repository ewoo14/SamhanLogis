package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.domain.ProductGoodsType;
import java.lang.reflect.Constructor;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/** 품목 응답 DTO 계열에서 goodsType wire field가 사라지지 않는지 고정한다. */
class ProductResponseGoodsTypeSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void productSummaryResponse_serializesGoodsType() throws Exception {
        assertGoodsType(ProductSummaryResponse.class);
    }

    @Test
    void productCatalogResponse_serializesGoodsType() throws Exception {
        assertGoodsType(ProductCatalogResponse.class);
    }

    @Test
    void productResponse_serializesGoodsType() throws Exception {
        assertGoodsType(ProductResponse.class);
    }

    private void assertGoodsType(Class<?> dtoType) throws Exception {
        RecordComponent[] components = dtoType.getRecordComponents();
        Object[] args = Arrays.stream(components)
                .map(component -> component.getType() == ProductGoodsType.class
                        ? ProductGoodsType.NON_GOODS
                        : defaultValue(component.getType()))
                .toArray();
        Constructor<?> constructor = dtoType.getDeclaredConstructor(
                Arrays.stream(components).map(RecordComponent::getType).toArray(Class<?>[]::new));
        String goodsType = objectMapper.readTree(objectMapper.writeValueAsString(constructor.newInstance(args)))
                .get("goodsType").asText();
        assertThat(goodsType).isEqualTo("NON_GOODS");
    }

    private static Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) return null;
        if (type == boolean.class) return false;
        if (type == int.class) return 0;
        if (type == long.class) return 0L;
        if (type == double.class) return 0D;
        if (type == float.class) return 0F;
        if (type == short.class) return (short) 0;
        if (type == byte.class) return (byte) 0;
        if (type == char.class) return '\0';
        throw new IllegalArgumentException("지원하지 않는 primitive: " + type);
    }
}
