package com.samhanair.logis.slip.publish;

import javax.sql.DataSource;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Qualifier;

/**
 * 전표 발행 매핑의 창고 실재성 검증에 사용하는 inventory DB 연결 설정.
 */
@Configuration
class WarehouseValidationDataSourceConfig {

    @Bean(name = "warehouseValidationDataSource")
    @ConfigurationProperties(prefix = "app.publish.warehouse-validation")
    DataSource warehouseValidationDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    JdbcTemplate warehouseValidationJdbcTemplate(
            @Qualifier("warehouseValidationDataSource") DataSource warehouseValidationDataSource) {
        return new JdbcTemplate(warehouseValidationDataSource);
    }
}
