package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Phase F (D-DF-04) — 두 번째 호출 → 409 COPY_ALREADY_SENT IT.
 */
class SignatureCopyDuplicateIT extends AbstractSignAndSendCopyIT {

    @Test
    void second_call_returns_409_with_previous_copySentAt() throws Exception {
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});

        // 첫 호출 — image/png 성공
        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));

        // 두 번째 호출 — 409 COPY_ALREADY_SENT
        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("COPY_ALREADY_SENT"))
                .andExpect(jsonPath("$.previousCopySentAt").exists());
    }
}
