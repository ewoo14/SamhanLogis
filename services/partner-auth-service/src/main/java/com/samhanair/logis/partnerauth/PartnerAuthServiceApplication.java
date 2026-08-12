package com.samhanair.logis.partnerauth;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.shared.audit.publisher.AuditPublisherAutoConfiguration;
import com.samhanair.logis.partnerauth.config.DcConfigClientProperties;
import com.samhanair.logis.partnerauth.config.PartnerAuthJwtProperties;
import com.samhanair.logis.partnerauth.config.PartnerActivityClientProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Import;

/**
 * Partner Auth Service entry point — Phase 6 M2.
 *
 * <p>거래처(파트너) 자체 인증 + 세션 관리 서비스. 자체 PostgreSQL DB
 * ({@code partner_auth_db}) 를 소유하며 7개 endpoint 를 노출한다 (설계서 §3).
 */
@SpringBootApplication
@Import({JpaAuditingConfig.class, AuditPublisherAutoConfiguration.class})
@EnableConfigurationProperties({PartnerAuthJwtProperties.class, DcConfigClientProperties.class,
        PartnerActivityClientProperties.class})
public class PartnerAuthServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PartnerAuthServiceApplication.class, args);
    }
}
