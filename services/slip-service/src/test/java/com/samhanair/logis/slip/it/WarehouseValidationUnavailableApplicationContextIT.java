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
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;

/** 창고 서비스 일시 장애 중에도 실제 Spring context가 종료되지 않는지 확인한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
@ActiveProfiles("test")
@ContextConfiguration(classes = WarehouseValidationUnavailableApplicationContextIT.UnavailableClientConfig.class)
@TestPropertySource(properties = "app.publish.warehouse-validation.enabled=true")
class WarehouseValidationUnavailableApplicationContextIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void 창고_조회_불가여도_Spring_context가_기동한다() {
        assertThat(applicationContext).isNotNull();
    }

    @TestConfiguration
    static class UnavailableClientConfig {
        @Bean
        @Primary
        WarehouseInternalClient warehouseInternalClient() {
            WarehouseInternalClient client = mock(WarehouseInternalClient.class);
            when(client.findWarehouseById(any(UUID.class)))
                    .thenReturn(WarehouseInternalClient.WarehouseLookup.unavailable());
            return client;
        }
    }
}
