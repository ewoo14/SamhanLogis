package com.samhanair.logis.accounting.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * CODEF 은행·카드 거래내역 조회 설정.
 *
 * <p>Phase 11 실 계약·키 발급 전까지 {@code submitMethod=DRY_RUN} 이 기본이다.
 * 자격 정보는 운영 PC .env 또는 AWS SSM 에서 주입하고, application.yml 에 평문을 두지 않는다.
 */
@Getter
@Component
public class CodefProperties {

    /** 전송 방식 서버 기본값 — DRY_RUN | CODEF. */
    @Value("${codef.submit-method:DRY_RUN}")
    private String submitMethod;

    /** CODEF API 키 — CODEF 모드 전용. */
    @Value("${codef.api-key:}")
    private String apiKey;

    /** CODEF Client ID — CODEF 모드 전용. */
    @Value("${codef.client-id:}")
    private String clientId;

    /** CODEF Client Secret — CODEF 모드 전용. */
    @Value("${codef.client-secret:}")
    private String clientSecret;

    /** CODEF API Base URL — Phase 11 실 CODEF API 구현 시 사용(현재 미사용). */
    @Value("${codef.base-url:https://api.codef.io}")
    private String baseUrl;
}
