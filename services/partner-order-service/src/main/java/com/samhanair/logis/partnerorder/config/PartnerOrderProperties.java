package com.samhanair.logis.partnerorder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * partner-order-service 도메인 옵션. yml 키 {@code samhan.draft.*}.
 *
 * <ul>
 *   <li>{@code samhan.draft.ttl-days} — 임시저장 만료 일수 (legacy 30일 보존, §3.1 가드)</li>
 * </ul>
 */
@Data
@ConfigurationProperties(prefix = "samhan.draft")
public class PartnerOrderProperties {

    /** 임시저장 TTL (일). 기본 30일 (legacy 동작 보존). */
    private int ttlDays = 30;
}
