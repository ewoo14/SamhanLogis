package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Phase F (D-DF-07) — sign-and-send-copy 성공 round trip IT.
 *
 * <p>WireMock 대신 SlipClient + PlaywrightCopyRenderer @MockBean 격리 — Chromium binary 미설치
 * 환경에서도 IT 가능 ([feedback_it_mockbean_external_clients] 패턴).
 */
class SignAndSendCopyIT extends AbstractSignAndSendCopyIT {

    @Test
    void signAndSendCopy_success_returns_image_png() throws Exception {
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47});

        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().exists("X-Signature-Id"))
                .andExpect(header().string("X-Slip-Bridged", "true"))
                .andExpect(header().exists("X-Copy-Sent-At"))
                .andExpect(header().string("X-Copy-Recipient-Phone-Masked",
                        Matchers.matchesPattern("\\d{3}-\\*{4}-\\d{4}")));

        // 자체 signatures 보존 + copy_sent_at NOT NULL
        var saved = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stopId);
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).isCopySent()).isTrue();
        assertThat(saved.get(0).getCopyImagePath()).isNotNull();
    }
}
