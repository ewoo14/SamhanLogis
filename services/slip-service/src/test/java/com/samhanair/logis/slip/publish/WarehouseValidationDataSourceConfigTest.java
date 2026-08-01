package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** 창고 검증 JDBC 접근이 의도한 inventory DataSource에 결속되는지 검증한다. */
class WarehouseValidationDataSourceConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(TestDataSourceConfiguration.class, WarehouseValidationDataSourceConfig.class)
            .withPropertyValues(
                    "app.publish.warehouse-validation.jdbc-url=jdbc:h2:mem:inventory-db",
                    "app.publish.warehouse-validation.username=sa",
                    "app.publish.warehouse-validation.password=");

    @Test
    void warehouseValidationJdbcTemplate_usesInventoryDataSource_notPrimarySlipDataSource() {
        contextRunner.run(context -> {
            JdbcTemplate validationJdbcTemplate = context.getBean("warehouseValidationJdbcTemplate", JdbcTemplate.class);
            DataSource inventoryDataSource = context.getBean("warehouseValidationDataSource", DataSource.class);

            assertThat(validationJdbcTemplate.getDataSource()).isSameAs(inventoryDataSource);
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
