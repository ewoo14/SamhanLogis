package com.samhanair.logis.groupware.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** R8 — 권한 헤더를 통한 bulk 발송 CREATE 격리 실 HTTP 테스트. 동적 권한 mock을 사용하지 않는다. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
class MessageBulkPermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    /** 외부 user-service 호출만 격리한다. 권한 클라이언트는 실제 HTTP 권한 검사를 사용한다. */
    @MockBean
    private UserClient userClient;

    @Test
    void R8_VIEW_only_사용자의_bulk_POST는_403이다() throws Exception {
        mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000302")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipientIds":["%s"],"body":"권한 격리"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }
}
