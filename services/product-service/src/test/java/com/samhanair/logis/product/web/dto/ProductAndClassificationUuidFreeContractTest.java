package com.samhanair.logis.product.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.RecordComponent;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

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

    private static Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) return null;
        if (type == boolean.class) return false;
        if (type == int.class) return 0;
        return 0;
    }
}
