package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * warehouse-code-map 이 실재하지 않는 UUID 를 가리키면 기동 검증이 실패해야 하는 계약 테스트.
 */
class WarehouseCodeMapperValidationTest {

    private static final UUID PLACEHOLDER = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Test
    void 실재하지_않는_매핑은_기동검증에서_실패한다() {
        assertThatThrownBy(() -> invokeValidation(
                Map.of("00003", PLACEHOLDER.toString()), Set.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("00003")
                .hasMessageContaining(PLACEHOLDER.toString());
    }

    private static void invokeValidation(Map<String, String> mappings, Set<UUID> existingIds) {
        try {
            Method method = WarehouseCodeMapper.class.getDeclaredMethod(
                    "validateConfiguredWarehouses", Map.class, Set.class);
            method.setAccessible(true);
            method.invoke(null, mappings, existingIds);
        } catch (InvocationTargetException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException(cause);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
