package com.samhanair.logis.log.messaging;

import java.util.Map;
import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

/**
 * Applies retention through a RabbitMQ policy instead of queue declaration arguments.
 *
 * <p>Queue arguments are immutable after a durable queue exists. A policy is mutable and
 * applies to both an existing queue (without dropping its messages) and a newly declared one.
 * Management API failure is deliberately logged and does not prevent the audit sink from
 * starting; broker policy health is observable through the log and must be retried by the
 * deployment/operator.
 */
@Slf4j
@Component
public class RabbitRetentionPolicyInitializer {
    public static final String POLICY_NAME = "samhan-audit-retention";
    static final String QUEUE_PATTERN = "^samhan\\.audit\\.(queue|failure\\.queue|read\\.queue)$";

    private final RestTemplate restTemplate;
    private final String managementUrl;
    private final String username;
    private final String password;
    private final long maxLength;
    private final long messageTtlMs;

    public RabbitRetentionPolicyInitializer(
            RestTemplate restTemplate,
            @Value("${samhan.audit.rabbit.management-url:http://${RABBIT_MANAGEMENT_HOST:${RABBIT_HOST:localhost}}:${RABBIT_MANAGEMENT_PORT:15672}}") String managementUrl,
            @Value("${spring.rabbitmq.username:samhan}") String username,
            @Value("${spring.rabbitmq.password:samhan_dev_pw}") String password,
            @Value("${samhan.audit.rabbit.audit-queue-max-length:10000}") long maxLength,
            @Value("${samhan.audit.rabbit.audit-queue-message-ttl-ms:86400000}") long messageTtlMs) {
        this.restTemplate = restTemplate;
        this.managementUrl = managementUrl;
        this.username = username;
        this.password = password;
        this.maxLength = maxLength;
        this.messageTtlMs = messageTtlMs;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void applyRetentionPolicy() {
        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth(username, password);
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> definition = Map.of(
                "pattern", QUEUE_PATTERN,
                "definition", Map.of("message-ttl", messageTtlMs, "max-length", maxLength),
                "priority", 10,
                "apply-to", "queues");
        try {
            restTemplate.put(URI.create(managementUrl + "/api/policies/%2F/" + POLICY_NAME),
                    new HttpEntity<>(definition, headers));
            log.info("Rabbit retention policy applied policy={} pattern={} ttlMs={} maxLength={}",
                    POLICY_NAME, QUEUE_PATTERN, messageTtlMs, maxLength);
        } catch (RestClientException ex) {
            log.error("Rabbit retention policy was not applied; audit service remains fail-soft "
                    + "policy={} reason={}", POLICY_NAME, ex.getMessage());
        }
    }
}
