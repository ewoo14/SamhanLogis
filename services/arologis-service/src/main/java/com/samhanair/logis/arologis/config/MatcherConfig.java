package com.samhanair.logis.arologis.config;

import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.matcher.InsungQuickDriverMatcher;
import com.samhanair.logis.arologis.matcher.MockDriverMatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * DriverMatcher Bean 등록 — Phase 10 W10-1.
 *
 * <p>{@code samhan.arologis.matcher.provider=mock} (default, W10-1) → {@link MockDriverMatcher} primary.
 * {@code samhan.arologis.matcher.provider=insung-quick} → {@link InsungQuickDriverMatcher} primary
 * (W10-2 시점 활성, 본 PR 호출 시 throw).
 *
 * <p>두 impl 모두 {@code @Component} 로 빈 등록되어 있으나, primary 선택은 본 config 가 결정.
 * 잘못된 provider 값 → {@link MockDriverMatcher} fallback + warn log.
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class MatcherConfig {

    private final ArologisMatcherProperties properties;

    /**
     * 활성 DriverMatcher 결정 — provider property 기반.
     */
    @Bean
    @Primary
    public DriverMatcher activeDriverMatcher(MockDriverMatcher mock, InsungQuickDriverMatcher insung) {
        String provider = properties.getProvider() == null ? "mock" : properties.getProvider().toLowerCase();
        return switch (provider) {
            case "insung-quick" -> {
                log.info("DriverMatcher = insung-quick (Phase 10 W10-2 vendor 통합 활성)");
                yield insung;
            }
            case "mock" -> {
                log.info("DriverMatcher = mock (Phase 10 W10-1 default, "
                        + "MOCK-001 / 010-0000-0000 driver 매칭)");
                yield mock;
            }
            default -> {
                log.warn("DriverMatcher provider '{}' 미지원 — mock 으로 fallback", provider);
                yield mock;
            }
        };
    }
}
