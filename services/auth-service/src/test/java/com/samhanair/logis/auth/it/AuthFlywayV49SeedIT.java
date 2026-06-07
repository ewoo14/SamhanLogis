package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** V49 V5 개발 계정 비밀번호 해시 교정이 실 로그인 계약을 회복하는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
class AuthFlywayV49SeedIT extends AbstractPostgresIT {

    private static final String DEV_ACCOUNT_PASSWORD = "dev_p05_pass!";
    private static final UUID DEV_SALES_ID = UUID.fromString("a0000000-0000-0000-0000-000000000004");

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("V49는 V5 대표 비-MASTER 계정 dev_sales의 dev_p05_pass! 로그인을 복구한다")
    void devSalesCanLoginWithRepairedV5PasswordHash() throws Exception {
        // dev_locked/dev_disabled 는 각각 잠금/비활성 seed 이므로 로그인 성공 단언 대상에서 제외한다.
        MvcResult loginResult = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "loginId": "dev_sales",
                                  "password": "%s"
                                }
                                """.formatted(DEV_ACCOUNT_PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode loginData = objectMapper.readTree(loginResult.getResponse().getContentAsString()).get("data");
        assertThat(loginData.path("token").asText()).isNotBlank();
        assertThat(loginData.path("userId").asText()).isEqualTo(DEV_SALES_ID.toString());
        assertThat(loginData.path("role").asText()).isEqualTo("SALES");
    }
}
