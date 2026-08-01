package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;

/** 창고 검증을 활성화한 실제 Spring context가 기동되는지 확인한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
@ActiveProfiles("test")
@ContextConfiguration(classes = WarehouseValidationApplicationContextIT.MockClientConfig.class)
@TestPropertySource(properties = "app.publish.warehouse-validation.enabled=true")
class WarehouseValidationApplicationContextIT extends AbstractPostgresIT {

    private static final UUID HQ = UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID HUBAL = UUID.fromString("11111111-1111-1111-1111-000000000002");
    private static final UUID ANSEONG = UUID.fromString("11111111-1111-1111-1111-000000000003");
    private static final UUID CHANGWON = UUID.fromString("11111111-1111-1111-1111-000000000004");

    @Autowired
    private WarehouseCodeMapperProbe probe;

    @Test
    void 검증을_활성화한_Spring_context가_네_개_매핑을_검증하고_기동한다() {
        assertThat(probe).isNotNull();
    }

    /** context 기동 시점에 네 매핑을 모두 FOUND로 응답하는 외부 client 격리 구성이다. */
    @TestConfiguration
    static class MockClientConfig {
        @Bean
        @Primary
        WarehouseInternalClient warehouseInternalClient() {
            WarehouseInternalClient client = mock(WarehouseInternalClient.class);
            when(client.findWarehouseById(any(UUID.class))).thenAnswer(invocation -> {
                UUID id = invocation.getArgument(0);
                return WarehouseInternalClient.WarehouseLookup.found(
                        new WarehouseInternalClient.WarehouseSummary(id, codeFor(id)));
            });
            when(client.findWarehouseByCode("00003"))
                    .thenReturn(java.util.Optional.of(new WarehouseInternalClient.WarehouseSummary(HQ, "00003")));
            when(client.findWarehouseByCode("2"))
                    .thenReturn(java.util.Optional.of(new WarehouseInternalClient.WarehouseSummary(HUBAL, "2")));
            when(client.findWarehouseByCode("14"))
                    .thenReturn(java.util.Optional.of(new WarehouseInternalClient.WarehouseSummary(ANSEONG, "14")));
            when(client.findWarehouseByCode("1"))
                    .thenReturn(java.util.Optional.of(new WarehouseInternalClient.WarehouseSummary(CHANGWON, "1")));
            return client;
        }

        private static String codeFor(UUID id) {
            if (HQ.equals(id)) return "00003";
            if (HUBAL.equals(id)) return "2";
            if (ANSEONG.equals(id)) return "14";
            if (CHANGWON.equals(id)) return "1";
            return "unknown";
        }

        @Bean
        WarehouseCodeMapperProbe warehouseCodeMapperProbe() {
            return new WarehouseCodeMapperProbe();
        }
    }

    /** 테스트 context에서 검증 bean 생성 자체를 관찰하기 위한 표식 bean. */
    static class WarehouseCodeMapperProbe {
    }
}
