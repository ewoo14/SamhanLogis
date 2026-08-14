package com.samhanair.logis.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.samhanair.logis.log.retention.AuditRetentionProperties;

/**
 * Logging Service entrypoint (Phase 1, project plan §3.7).
 *
 * Consumes audit log events from RabbitMQ and persists them into
 * Elasticsearch. DEV-3 activity endpoints are additionally protected by
 * downstream dynamic RBAC so DEVELOPER can use the log viewer without opening
 * the legacy MASTER/MANAGER audit search route.
 */
@SpringBootApplication
@EnableConfigurationProperties(AuditRetentionProperties.class)
public class LoggingServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoggingServiceApplication.class, args);
    }
}
