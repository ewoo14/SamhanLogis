package com.samhanair.logis.auth;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.common.audit.JpaAuditingConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Import;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.samhanair.logis.auth.claude.ClaudeCredentialProperties;
import com.samhanair.logis.auth.claude.ClaudeVirtualAgentProperties;

/** Auth Service entry point — JWT issuer + account CRUD for SamhanLogis MSA (plan §3.4). */
@SpringBootApplication
@Import(JpaAuditingConfig.class)
@EnableConfigurationProperties({JwtIssueProperties.class, ClaudeCredentialProperties.class,
        ClaudeVirtualAgentProperties.class})
public class AuthServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}
