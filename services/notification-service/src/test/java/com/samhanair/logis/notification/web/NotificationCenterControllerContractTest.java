package com.samhanair.logis.notification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.domain.NotificationSeverity;
import com.samhanair.logis.notification.domain.NotificationCenter;
import com.samhanair.logis.notification.service.NotificationCenterService;
import com.samhanair.logis.notification.web.dto.NotificationCenterPage;
import com.samhanair.logis.notification.web.dto.NotificationCenterResponse;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;

@ExtendWith(MockitoExtension.class)
class NotificationCenterControllerContractTest {

    private static final Pattern UUID_LITERAL = Pattern.compile(
            "(?i)(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])");

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID NOTIFICATION_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Mock
    private NotificationCenterService service;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new NotificationCenterController(service))
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver())
                .build();
        objectMapper = new ObjectMapper().findAndRegisterModules();
    }

    @Test
    void myResponseBody_containsNoUuidAnywhere() throws Exception {
        when(service.findMyUnread(USER_ID, "MASTER")).thenReturn(List.of(response()));

        var result = mockMvc.perform(get("/notifications/my")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(UUID_LITERAL.matcher(body).find()).as("response body 전체 UUID 검사: %s", body).isFalse();
    }

    @Test
    void historyResponseBody_containsNoUuidAnywhere() throws Exception {
        when(service.findMyHistory(USER_ID, "MASTER", PageRequest.of(0, 50)))
                .thenReturn(new NotificationCenterPage(List.of(response()), 0, 50, 1, 1));

        var result = mockMvc.perform(get("/notifications/history")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(UUID_LITERAL.matcher(body).find()).as("response body 전체 UUID 검사: %s", body).isFalse();
    }

    @Test
    void acknowledgeAcceptsOpaqueTokenAndKeepsHttpContract() throws Exception {
        String token = "IiIiIiIiIiIiIiIiIiIiIg";

        mockMvc.perform(post("/notifications/{id}/acknowledge", token)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());

        verify(service).acknowledge(eq(NOTIFICATION_ID), eq(USER_ID), eq("MASTER"));
    }

    private NotificationCenterResponse response() {
        return NotificationCenterResponse.from(NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO, NOTIFICATION_ID.toString(),
                "body " + NOTIFICATION_ID, null, USER_ID, "groupware-service",
                NOTIFICATION_ID.toString(), "/messenger/" + NOTIFICATION_ID));
    }
}
