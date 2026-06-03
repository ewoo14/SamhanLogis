package com.samhanair.logis.slip.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 시간 의존 컴포넌트가 테스트에서 고정 시각을 주입받을 수 있게 하는 기본 clock 설정.
 */
@Configuration
public class TimeConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
