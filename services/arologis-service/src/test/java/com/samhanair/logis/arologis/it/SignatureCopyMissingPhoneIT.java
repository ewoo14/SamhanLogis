package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Phase F (D-DF-05) — slip recipientPhone null → RECIPIENT_PHONE_MISSING IT.
 *
 * <p>서명 양쪽 저장 OK + 사본 skip + reason 응답. renderer 미호출 검증.
 */
class SignatureCopyMissingPhoneIT extends AbstractSignAndSendCopyIT {

    @Test
    void missing_recipient_phone_returns_200_with_reason() throws Exception {
        // recipientPhone empty (slip lookup 응답 null) — base setup override
        when(slipClient.findRecipientPhone(any())).thenReturn(Optional.empty());

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
                .andExpect(jsonPath("$.copyFailureReason").value("RECIPIENT_PHONE_MISSING"))
                .andExpect(jsonPath("$.slipBridged").value(true));

        // renderer 미호출 검증
        verify(renderer, never()).render(any(), any(), any());
    }
}
