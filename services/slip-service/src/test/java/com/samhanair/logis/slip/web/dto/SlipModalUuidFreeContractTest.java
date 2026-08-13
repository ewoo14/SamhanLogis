package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.publish.PublishSlipResponse;
import java.lang.reflect.Constructor;
import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** 전표 모달 검색·상세 경로의 요청 식별자와 응답 전체(중첩 포함) UUID 비공개 계약. */
class SlipModalUuidFreeContractTest {

    private static final UUID ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID PARTNER_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID WAREHOUSE_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID LINE_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");

    @Test
    void searchDetailAndPublishResponseBodies_areUuidFreeAcrossNestedStructures() throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        SlipResponse searchRow = recordWithUuids(SlipResponse.class);
        SlipDetailResponse detail = recordWithUuids(SlipDetailResponse.class);
        PublishSlipResponse publish = recordWithUuids(PublishSlipResponse.class);

        String responseBody = mapper.writeValueAsString(Map.of(
                "search", Map.of("content", List.of(searchRow)),
                "detail", detail,
                "publish", publish));

        assertThat(UUID_PATTERN.matcher(responseBody).find())
                .as("전표 검색·상세 응답과 중첩 라인 UUID scan — body=%s", responseBody)
                .isFalse();
    }

    @Test
    void detailRequestIdentifier_isOpaqueAndResolvesTheSameSlip() {
        String token = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(java.nio.ByteBuffer.allocate(16)
                        .putLong(ID.getMostSignificantBits()).putLong(ID.getLeastSignificantBits()).array());

        assertThat(token).doesNotContain("-");
        assertThat(token).doesNotContain(ID.toString());
        assertThat(OpaqueUuidDeserializer.decode(token)).isEqualTo(ID);
    }

    private static <T> T recordWithUuids(Class<T> type) throws Exception {
        RecordComponent[] components = type.getRecordComponents();
        Object[] args = new Object[components.length];
        for (int i = 0; i < components.length; i++) {
            Class<?> componentType = components[i].getType();
            String name = components[i].getName();
            if (componentType == UUID.class) {
                args[i] = switch (name) {
                    case "id", "slipId" -> ID;
                    case "partnerId" -> PARTNER_ID;
                    default -> WAREHOUSE_ID;
                };
            } else if (componentType == String.class) {
                args[i] = switch (name) {
                    case "slipNo" -> "2026/08/02-17";
                    case "requesterId", "acceptedBy", "dispatcherUserId", "inspectorUserId" -> ID.toString();
                    default -> "test";
                };
            } else if (componentType == LocalDate.class) {
                args[i] = LocalDate.of(2026, 8, 2);
            } else if (componentType == LocalDateTime.class) {
                args[i] = LocalDateTime.of(2026, 8, 2, 10, 0);
            } else if (componentType == int.class) {
                args[i] = 1;
            } else if (componentType == long.class || componentType == Long.class) {
                args[i] = 1L;
            } else if (componentType == boolean.class || componentType == Boolean.class) {
                args[i] = false;
            } else if (componentType == List.class) {
                args[i] = type == SlipDetailResponse.class
                        ? List.of(recordWithUuids(SlipLineResponse.class)) : List.of();
            } else if (componentType == BigDecimal.class) {
                args[i] = java.math.BigDecimal.ONE;
            } else if (componentType.isEnum()) {
                args[i] = componentType.getEnumConstants()[0];
            } else {
                args[i] = null;
            }
        }
        Constructor<T> constructor = type.getDeclaredConstructor(
                java.util.Arrays.stream(components).map(RecordComponent::getType).toArray(Class<?>[]::new));
        return constructor.newInstance(args);
    }
}
