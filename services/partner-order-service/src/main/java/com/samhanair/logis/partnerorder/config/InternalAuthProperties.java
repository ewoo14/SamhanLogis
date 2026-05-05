package com.samhanair.logis.partnerorder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shared-secret used as {@code X-Internal-Token} when calling sibling services
 * ({@code slip-service /from-partner-order}, {@code product-service /products/internal/**},
 * {@code inventory-service /inventory/**} 등). Configured via {@code samhan.internal-token}
 * (env override: {@code INTERNAL_TOKEN}).
 */
@Data
@ConfigurationProperties(prefix = "samhan")
public class InternalAuthProperties {

    /** 형제 서비스 공유 비밀 (X-Internal-Token). 미설정 시 client 호출 INTERNAL_ERROR. */
    private String internalToken;
}
