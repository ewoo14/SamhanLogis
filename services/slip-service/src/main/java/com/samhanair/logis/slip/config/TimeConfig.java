package com.samhanair.logis.slip.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 시간 의존 컴포넌트가 테스트에서 고정 시각을 주입받을 수 있게 하는 기본 clock 설정.
 *
 * <p>한국 전용 ERP 이므로 zone 을 {@code Asia/Seoul} 로 고정한다. 서버 기본 TZ(컨테이너 UTC 등) 와
 * 무관하게 retention 스케줄 cron(zone=Asia/Seoul) 의 cutoff 계산 및 감사 시각(occurredAt) 이
 * 한국시간 기준으로 일관된다. (Codex cross-check P1 — Clock zone ↔ cron zone 일치.)
 */
@Configuration
public class TimeConfig {

    @Bean
    public Clock clock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }
}
