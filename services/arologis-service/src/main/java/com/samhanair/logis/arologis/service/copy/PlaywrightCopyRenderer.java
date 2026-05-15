package com.samhanair.logis.arologis.service.copy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import com.microsoft.playwright.options.ScreenshotType;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 출고전표 양식 사본 PNG 합성 — Phase F (D-DF-06).
 *
 * <p>흐름: print-renderer file:// URL + slip 데이터 + 서명 2개 base64 query param → Chromium goto →
 * fullPage screenshot (PNG byte[]) 반환.
 *
 * <p>OutboundView 의 a4-portrait variant 그대로 사용 (clients/desktop/print-renderer/ 별도 entry 빌드).
 * 양식 변경 시 print-renderer 재빌드 → Docker 이미지 재배포 (drift 0).
 *
 * <p>Browser bean 은 PlaywrightConfig 에서 Chromium binary 가용 시에만 생성 — IT / 단위는
 * {@code @MockBean} 또는 Mockito.mock 으로 격리 ([feedback_it_mockbean_external_clients]).
 */
@Slf4j
@Component
public class PlaywrightCopyRenderer {

    private final Browser browser;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final int timeoutMs;
    private final int viewportWidth;
    private final int viewportHeight;

    public PlaywrightCopyRenderer(
            @Autowired(required = false) Browser browser,
            ObjectMapper objectMapper,
            @Value("${arologis.playwright.copy.base-url:file:///app/print-renderer/index.html}") String baseUrl,
            @Value("${arologis.playwright.copy.timeout-ms:8000}") int timeoutMs,
            @Value("${arologis.playwright.copy.viewport-width:600}") int viewportWidth,
            @Value("${arologis.playwright.copy.viewport-height:850}") int viewportHeight) {
        this.browser = browser;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
    }

    /**
     * 슬립 데이터 + 서명 2개로 출고전표 사본 PNG 합성.
     *
     * @param slipData slipNo / slipDate / partnerName / recipientAddress / lines (List of Map) /
     *                 totalSupply / vat / total / sourceWarehouseName / capturedAt / gpsLat / gpsLng
     * @param driverSignatureBase64 기사 서명 PNG base64
     * @param recipientSignatureBase64 인수자 서명 PNG base64
     * @return PNG byte[] (~200~800KB)
     * @throws RendererTimeoutException Chromium goto/screenshot timeout (D-DF-06 timeout-ms 초과)
     * @throws RendererErrorException Chromium 기타 오류 또는 Browser bean 미주입
     */
    public byte[] render(Map<String, Object> slipData,
                         String driverSignatureBase64,
                         String recipientSignatureBase64) {
        if (browser == null) {
            throw new RendererErrorException(
                    "Playwright Browser bean 미주입 — Chromium binary 미설치 또는 arologis.playwright.enabled=false",
                    null);
        }
        try (BrowserContext context = browser.newContext()) {
            context.setDefaultTimeout(timeoutMs);
            try (Page page = context.newPage()) {
                page.setViewportSize(viewportWidth, viewportHeight);

                String url = buildUrl(slipData, driverSignatureBase64, recipientSignatureBase64);
                page.navigate(url);
                page.waitForLoadState();  // network idle

                return page.screenshot(new Page.ScreenshotOptions()
                        .setFullPage(true)
                        .setType(ScreenshotType.PNG));
            } catch (PlaywrightException ex) {
                if (ex.getMessage() != null && ex.getMessage().toLowerCase().contains("timeout")) {
                    log.warn("Playwright timeout — slipNo={}, msg={}", slipData.get("slipNo"), ex.getMessage());
                    throw new RendererTimeoutException(ex.getMessage(), ex);
                }
                throw new RendererErrorException(ex.getMessage(), ex);
            }
        } catch (PlaywrightException ex) {
            throw new RendererErrorException(ex.getMessage(), ex);
        }
    }

    private String buildUrl(Map<String, Object> slipData,
                            String driverSig, String recipientSig) {
        try {
            String slipJson = objectMapper.writeValueAsString(slipData);
            String slipB64 = Base64.getUrlEncoder().encodeToString(slipJson.getBytes(StandardCharsets.UTF_8));
            return baseUrl
                    + "?slip=" + slipB64
                    + "&driverSig=" + URLEncoder.encode(driverSig, StandardCharsets.UTF_8)
                    + "&recipientSig=" + URLEncoder.encode(recipientSig, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new RendererErrorException("URL 인코딩 실패: " + ex.getMessage(), ex);
        }
    }

    /** Playwright 호출 timeout 시 (Tx2 c 단계 fail). */
    public static class RendererTimeoutException extends RuntimeException {
        public RendererTimeoutException(String msg, Throwable cause) { super(msg, cause); }
    }

    /** Playwright 기타 오류 (Chromium crash 등). */
    public static class RendererErrorException extends RuntimeException {
        public RendererErrorException(String msg, Throwable cause) { super(msg, cause); }
    }
}
