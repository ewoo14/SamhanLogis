package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** 창고 검증이 Spring DataSource pool을 추가하지 않고 연결 설정만 보유하는지 검증한다. */
class WarehouseValidationDataSourceConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestDataSourceConfiguration.class, WarehouseValidationDataSourceConfig.class)
            .withPropertyValues(
                    "app.publish.warehouse-validation.jdbc-url=jdbc:h2:mem:inventory-db",
                    "app.publish.warehouse-validation.username=sa",
                    "app.publish.warehouse-validation.password=");

    @Test
    void warehouseValidation_keepsOnlyConnectionProperties_withoutAdditionalDataSourceBean() {
        contextRunner.run(context -> {
            assertThat(context).doesNotHaveBean("warehouseValidationDataSource");
            assertThat(context).doesNotHaveBean("warehouseValidationJdbcTemplate");
            WarehouseValidationDataSourceConfig.WarehouseValidationProperties properties =
                    context.getBean(WarehouseValidationDataSourceConfig.WarehouseValidationProperties.class);
            assertThat(properties.getJdbcUrl()).isEqualTo("jdbc:h2:mem:inventory-db");
            assertThat(properties.getUsername()).isEqualTo("sa");
        });
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestDataSourceConfiguration {

        @Bean
        @Primary
        DataSource dataSource() {
            return new DriverManagerDataSource("jdbc:h2:mem:slip-db", "sa", "");
        }
    }
}
