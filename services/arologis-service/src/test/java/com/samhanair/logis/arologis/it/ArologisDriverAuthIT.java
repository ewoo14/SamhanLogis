package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.DriverLoginRequest;
import com.samhanair.logis.arologis.dto.MeResponse;
import com.samhanair.logis.arologis.repository.DriverRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Driver passwordless 로그인 IT — 2026-05-14 분리 (B13).
 *
 * <p>흐름: Driver 시드 → POST /auth/driver/login (phoneNumber 만) → AROLOGIS_DRIVER JWT 수령.
 * 미등록 phoneNumber → 401. 잘못된 형식 → 400.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisDriverAuthIT extends AbstractPostgresIT {

    @Autowired private MockMvc mvc;
    @Autowired private DriverRepository driverRepo;
    @Autowired private ObjectMapper om;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    void seed() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());

        driverRepo.findByPhoneNumberAndIsDeletedFalse("01011112222")
                .orElseGet(() -> driverRepo.save(
                        Driver.of("ITD001", "01011112222", "1톤", DriverSource.INTERNAL, false, null)));
        driverRepo.findByDriverCode("ITH001")
                .orElseGet(() -> driverRepo.save(
                        Driver.of("ITH001", "010-2000-0001", "1톤", DriverSource.INTERNAL, false, null)));
    }

    @Test
    void registered_phone_issues_driver_jwt() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("01011112222"));
        String res = mvc.perform(post("/auth/driver/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        AuthTokenResponse tokens = om.readValue(res, AuthTokenResponse.class);
        assertThat(tokens.role()).isEqualTo("AROLOGIS_DRIVER");
        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(tokens.driverCode()).isEqualTo("ITD001");
        assertThat(tokens.phoneNumber()).isEqualTo("01011112222");

        String meJson = mvc.perform(get("/auth/me")
                        .header("Authorization", "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        MeResponse me = om.readValue(meJson, MeResponse.class);
        assertThat(me.role()).isEqualTo("AROLOGIS_DRIVER");
        assertThat(me.driverCode()).isEqualTo("ITD001");
        assertThat(me.phoneNumber()).isEqualTo("01011112222");
    }

    @Test
    void unregistered_phone_returns_401() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("01099999999"));
        mvc.perform(post("/auth/driver/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void hyphenated_persisted_phone_accepts_both_input_forms() throws Exception {
        for (String phoneNumber : java.util.List.of("010-2000-0001", "01020000001")) {
            String body = om.writeValueAsString(new DriverLoginRequest(phoneNumber));
            String res = mvc.perform(post("/auth/driver/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            AuthTokenResponse tokens = om.readValue(res, AuthTokenResponse.class);
            assertThat(tokens.driverCode()).isEqualTo("ITH001");
            assertThat(tokens.phoneNumber()).isEqualTo("010-2000-0001");
        }
    }

    @Test
    void invalid_phone_format_returns_400() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("not-a-phone"));
        mvc.perform(post("/auth/driver/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }
}
