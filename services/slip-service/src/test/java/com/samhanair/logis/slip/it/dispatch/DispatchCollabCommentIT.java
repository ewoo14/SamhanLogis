package com.samhanair.logis.slip.it.dispatch;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * DispatchTask 협업 댓글 실 DB IT.
 *
 * <p>V37 {@code dispatch_collab_comments} INSERT/SELECT/soft-delete 경로와 dispatch.board
 * 권한/문서 스코프 가드를 MockMvc + Testcontainers PostgreSQL 로 고정한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
class DispatchCollabCommentIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String DISPATCH_ACCOUNT_ID = "10000000-0000-0000-0000-000000000471";
    private static final String DISPATCH_BOARD_PAGE_CODE = "dispatch.board";
    private static final LocalDate DISPATCH_DATE = LocalDate.of(2099, 6, 12);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchTaskRepository taskRepository;

    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(any()))
                .thenReturn(Optional.of("배차담당자"));
    }

    @Test
    void comment_roundtrip_persists_lists_softDeletes_and_hides_from_recent() throws Exception {
        UUID taskId = seedTask("2099/06/12-COMMENT-RT").getId();

        String createResponse = mvc.perform(post("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .header(USER_NAME_HEADER, "배차담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "차량 배정 확인",
                                "anchor", "vehicleGroups[0]"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value("차량 배정 확인"))
                .andExpect(jsonPath("$.data.authorName").value("배차담당자"))
                .andExpect(jsonPath("$.data.anchor").value("vehicleGroups[0]"))
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResponse).get("id"));

        mvc.perform(get("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(commentId.toString()))
                .andExpect(jsonPath("$.data[0].body").value("차량 배정 확인"));

        mvc.perform(delete("/admin/dispatch-tasks/{taskId}/comments/{commentId}", taskId, commentId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void post_comment_persistsKoreanAuthorName_roundTrip() throws Exception {
        UUID taskId = seedTask("2099/06/12-COMMENT-ENCODED-AUTHOR").getId();
        String displayName = "[DEV-SEED] \uAC1C\uBC1C\uB9C8\uC2A4\uD130";
        String body = "\uBC30\uCC28 \uCF54\uBA58\uD2B8 \uBCF8\uBB38\uC740 \uC815\uC0C1 \uC800\uC7A5";

        // FilterRegistrationBean 기반 UserHeaderDecodingFilter 는 MockMvc 체인에 자동 포함되지 않는다.
        // URL/charset 복원은 shared/security 단위 테스트가 맡고, 본 IT 는 한글 JPA/Postgres 왕복만 고정한다.
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .header(USER_NAME_HEADER, displayName)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", body,
                                "anchor", "vehicleGroups[0]"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value(body))
                .andExpect(jsonPath("$.data.authorName").value(displayName));

        mvc.perform(get("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].body").value(body))
                .andExpect(jsonPath("$.data[0].authorName").value(displayName));
    }

    @Test
    void post_requires_dispatch_board_update_permission() throws Exception {
        UUID taskId = seedTask("2099/06/12-COMMENT-403").getId();
        when(dynamicPermissionClient.check(
                        any(UUID.class), eq(DISPATCH_BOARD_PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), eq(DISPATCH_BOARD_PAGE_CODE)))
                .thenReturn(false);

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/comments", taskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "권한 없음"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void delete_comment_through_other_task_scope_returns404() throws Exception {
        UUID ownerTaskId = seedTask("2099/06/12-COMMENT-A").getId();
        UUID otherTaskId = seedTask("2099/06/12-COMMENT-B").getId();
        String createResponse = mvc.perform(post("/admin/dispatch-tasks/{taskId}/comments", ownerTaskId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .header(USER_NAME_HEADER, "배차담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "A task 댓글"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResponse).get("id"));

        mvc.perform(delete("/admin/dispatch-tasks/{taskId}/comments/{commentId}", otherTaskId, commentId)
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    void post_comment_to_missing_task_returns404() throws Exception {
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/comments", UUID.randomUUID())
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "미존재 task"))))
                .andExpect(status().isNotFound());
    }

    private DispatchTask seedTask(String taskCode) {
        return taskRepository.save(DispatchTask.create(taskCode, DISPATCH_DATE));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
