package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Phase F (D-DF-06) — PlaywrightCopyRenderer Mockito fake 단위 테스트 (Chromium binary 불필요).
 */
class PlaywrightCopyRendererTest {

    private Browser browser;
    private BrowserContext context;
    private Page page;
    private PlaywrightCopyRenderer renderer;

    @BeforeEach
    void setUp() {
        browser = mock(Browser.class);
        context = mock(BrowserContext.class);
        page = mock(Page.class);
        when(browser.newContext()).thenReturn(context);
        when(context.newPage()).thenReturn(page);
        renderer = new PlaywrightCopyRenderer(browser, new ObjectMapper(),
                "file:///app/print-renderer/index.html", 8000, 600, 850);
    }

    @Test
    void render_returns_screenshot_bytes() {
        byte[] expected = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47};
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(expected);

        byte[] actual = renderer.render(
                Map.of("slipNo", "SL-001", "partnerName", "대구공조"),
                "driver-base64", "recipient-base64");

        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void render_timeout_throws_RendererTimeoutException() {
        when(page.screenshot(any(Page.ScreenshotOptions.class)))
                .thenThrow(new PlaywrightException("Timeout 8000ms exceeded"));

        assertThatThrownBy(() -> renderer.render(Map.of("slipNo", "SL-001"), "a", "b"))
                .isInstanceOf(PlaywrightCopyRenderer.RendererTimeoutException.class);
    }

    @Test
    void render_other_error_throws_RendererErrorException() {
        when(page.screenshot(any(Page.ScreenshotOptions.class)))
                .thenThrow(new PlaywrightException("Chromium crashed"));

        assertThatThrownBy(() -> renderer.render(Map.of("slipNo", "SL-001"), "a", "b"))
                .isInstanceOf(PlaywrightCopyRenderer.RendererErrorException.class);
    }

    @Test
    void render_sets_viewport_size_600x850() {
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(new byte[]{0x01});

        renderer.render(Map.of("slipNo", "SL-001"), "a", "b");

        verify(page).setViewportSize(600, 850);
    }

    @Test
    void render_navigates_with_query_params() {
        when(page.screenshot(any(Page.ScreenshotOptions.class))).thenReturn(new byte[]{0x01});

        renderer.render(Map.of("slipNo", "SL-001"), "drv", "rcp");

        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        verify(page).navigate(urlCaptor.capture());
        assertThat(urlCaptor.getValue()).startsWith("file:///app/print-renderer/index.html?slip=");
        assertThat(urlCaptor.getValue()).contains("driverSig=drv");
        assertThat(urlCaptor.getValue()).contains("recipientSig=rcp");
    }

    @Test
    void render_with_null_browser_throws_RendererErrorException() {
        PlaywrightCopyRenderer noBrowser = new PlaywrightCopyRenderer(null, new ObjectMapper(),
                "file:///app/print-renderer/index.html", 8000, 600, 850);

        assertThatThrownBy(() -> noBrowser.render(Map.of("slipNo", "SL-001"), "a", "b"))
                .isInstanceOf(PlaywrightCopyRenderer.RendererErrorException.class)
                .hasMessageContaining("Playwright Browser bean 미주입");
    }
}
