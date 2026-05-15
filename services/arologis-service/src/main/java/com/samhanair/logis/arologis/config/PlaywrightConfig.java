package com.samhanair.logis.arologis.config;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Playwright;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Phase F (D-DF-06) — Playwright Chromium browser singleton bean.
 *
 * <p>arologis-service 시작 시 1회 launch, shutdown 시 close. context/page 는 호출마다 신규
 * (PlaywrightCopyRenderer 가 try-with-resources 로 lifecycle 관리).
 *
 * <p>Chromium binary 는 Docker 빌드 시 동봉 (Dockerfile 의 {@code playwright install chromium}).
 * 본 bean 은 binary 가 없으면 launch 실패 — DevOps team 의 Dockerfile 갱신 의무.
 *
 * <p>local profile / IT (Chromium 미설치 환경) 에서는 {@code arologis.playwright.enabled=false}
 * 로 disable 가능. PlaywrightCopyRenderer 는 IT 시 @MockBean 으로 격리.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(prefix = "arologis.playwright", name = "enabled", havingValue = "true",
        matchIfMissing = false)
public class PlaywrightConfig {

    private Playwright playwright;
    private Browser browser;

    @Bean
    public Browser playwrightBrowser() {
        this.playwright = Playwright.create();
        this.browser = playwright.chromium().launch(
                new BrowserType.LaunchOptions()
                        .setHeadless(true)
                        .setArgs(java.util.List.of("--no-sandbox", "--disable-dev-shm-usage")));
        log.info("Playwright Chromium 시작 — headless, no-sandbox");
        return this.browser;
    }

    @PreDestroy
    public void shutdown() {
        if (browser != null) {
            browser.close();
        }
        if (playwright != null) {
            playwright.close();
        }
        log.info("Playwright Chromium 종료");
    }
}
