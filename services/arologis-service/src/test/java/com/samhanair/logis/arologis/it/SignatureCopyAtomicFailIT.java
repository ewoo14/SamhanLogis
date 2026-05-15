package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Phase F (D-DF-01) — Tx1 atomic fail (slip-service registerSignature false) → 422
 * SIGNATURE_BRIDGE_FAILED + Spring rollback (signatures 미저장) IT.
 */
class SignatureCopyAtomicFailIT extends AbstractSignAndSendCopyIT {

    @Test
    void slip_service_reject_returns_422_and_no_signature_inserted() throws Exception {
        // slip-service 거부 — 5xx 상응 (SlipClient.registerSignature false 반환)
        when(slipClient.registerSignature(any(), any())).thenReturn(false);

        long beforeCount = signatureRepository.count();

        mockMvc.perform(post(
                        "/driver-app/arologis/dispatches/{d}/vehicles/{v}/stops/{s}/sign-and-send-copy",
                        dispatchId, 1, 1)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error", startsWith("SIGNATURE_BRIDGE_FAILED")))
                .andExpect(jsonPath("$.retryable").value(true));

        // Tx1 보상 트랜잭션 — Signature INSERT rollback 확인
        long afterCount = signatureRepository.count();
        assertThat(afterCount).isEqualTo(beforeCount);
    }
}
