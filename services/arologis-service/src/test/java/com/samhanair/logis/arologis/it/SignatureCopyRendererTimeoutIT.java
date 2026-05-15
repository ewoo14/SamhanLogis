package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.service.copy.PlaywrightCopyRenderer;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Phase F (D-DF-06) — Playwright timeout → 200 + RENDERER_TIMEOUT IT.
 *
 * <p>copy_sent_at 미설정 → 같은 endpoint 재호출 OK (1회 가드 작동 X). retry 가능 검증.
 */
class SignatureCopyRendererTimeoutIT extends AbstractSignAndSendCopyIT {

    @Test
    void renderer_timeout_returns_200_with_RENDERER_TIMEOUT_and_retry_succeeds() throws Exception {
        // 1차 — timeout
        when(renderer.render(any(), any(), any()))
                .thenThrow(new PlaywrightCopyRenderer.RendererTimeoutException("Timeout 8000ms exceeded", null));

        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.copySent").value(false))
                .andExpect(jsonPath("$.copyFailureReason").value("RENDERER_TIMEOUT"));

        // copy_send_failure_count == 1 검증
        var saved = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stopId);
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getCopySendFailureCount()).isEqualTo(1);
        assertThat(saved.get(0).isCopySent()).isFalse();

        // 2차 — 같은 endpoint 재호출 → 가드 작동 X (copy_sent_at NULL), 다시 시도 후 성공
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});

        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));
    }
}
