package com.samhanair.logis.log.web;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.log.dlq.DlqOperations;
import com.samhanair.logis.security.InternalTokenFilter;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.beans.factory.annotation.Autowired;

/** Gateway가 주입한 사용자 헤더로 DLQ 운영 API가 실제 HTTP 인증되는지 검증한다. */
@WebMvcTest(DlqController.class)
@Import(com.samhanair.logis.log.config.SecurityConfig.class)
@TestPropertySource(properties = "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration")
class DlqControllerSecurityTest {

    private static final String MASTER = "00000000-0000-0000-0000-000000000001";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DlqOperations operations;

    @MockBean
    private InternalTokenFilter internalTokenFilter;

    @BeforeEach
    void stubOperations() {
        when(operations.inspect(anyInt())).thenReturn(List.of());
        when(operations.retry("missing-message")).thenReturn(false);
        when(operations.discard("missing-message", "qa-proof")).thenReturn(false);
    }

    @Test
    @DisplayName("MASTER 사용자 헤더는 DLQ inspect를 200으로 통과한다")
    void masterHeader_allowsDlqInspect() throws Exception {
        mockMvc.perform(get("/logs/dlq?limit=20").headers(masterHeaders()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("MASTER 사용자 헤더는 DLQ retry를 200으로 통과한다")
    void masterHeader_allowsDlqRetry() throws Exception {
        mockMvc.perform(post("/logs/dlq/missing-message/retry").headers(masterHeaders()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("MASTER 사용자 헤더는 DLQ discard를 200으로 통과한다")
    void masterHeader_allowsDlqDiscard() throws Exception {
        mockMvc.perform(post("/logs/dlq/missing-message/discard?reason=qa-proof").headers(masterHeaders()))
                .andExpect(status().isOk());
    }

    private static HttpHeaders masterHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-User-Id", MASTER);
        headers.add("X-User-Groups", "00000000-0000-0000-0000-000000000100");
        headers.add("X-Is-System-Master", "true");
        return headers;
    }
}
