package com.samhanair.logis.slip.publish;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 창고 UUID 기동 검증에 필요한 inventory DB 접속 설정.
 *
 * <p>검증은 기동 시 일회성 JDBC 연결로 수행하므로 Spring DataSource 또는 Hikari pool을
 * 추가하지 않는다. 따라서 slip-service의 주 DataSource와 가격기억 전용 DataSource 계약을
 * 침범하지 않고, 컨텍스트마다 pool이 하나 더 생기는 문제도 피한다.
 */
@Configuration
@EnableConfigurationProperties(WarehouseValidationDataSourceConfig.WarehouseValidationProperties.class)
class WarehouseValidationDataSourceConfig {

    /** 일회성 창고 검증 JDBC 연결 설정. */
    @ConfigurationProperties(prefix = "app.publish.warehouse-validation")
    @Getter
    @Setter
    public static class WarehouseValidationProperties {
        private String jdbcUrl;
        private String username;
        private String password;
    }
}
