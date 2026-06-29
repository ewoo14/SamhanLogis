package com.samhanair.logis.notification.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.dto.ChatRoomMappingCreateRequest;
import com.samhanair.logis.notification.repository.PartnerChatRoomMappingRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * 단톡방 매핑 admin endpoint IT (PR-D Part 2-3).
 *
 * <p>{@link PartnerLookupClient} = {@code @MockBean} 격리 (memory feedback_it_mockbean_external_clients —
 * BE-E 의 by-name endpoint 미구현 시점에도 본 IT 가 단독 통과 가능).
 *
 * <p>{@link UserClient} 도 형제 IT 동일 패턴으로 격리.
 *
 * <ol>
 *   <li>POST /chat-rooms — 단건 등록 → 201</li>
 *   <li>GET /chat-rooms — 전체 목록 조회 → 200, 1건</li>
 *   <li>POST /chat-rooms — 중복 등록 → 409 CONFLICT</li>
 *   <li>POST /chat-rooms/import — multipart CSV (3 row + legacy alias miss) → inserted=3, rejected=0</li>
 *   <li>DELETE /chat-rooms/{id} — soft-delete → 200</li>
 * </ol>
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class ChatRoomMappingAdminControllerIT extends AbstractPostgresIT {

    private static final String ADMIN_ACCOUNT_ID = "10000000-0000-0000-0000-000000000211";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private PartnerChatRoomMappingRepository repository;

    @MockBean
    private UserClient userClient;
    @MockBean
    private PartnerLookupClient partnerLookupClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setup() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            Map<UUID, Boolean> r = new HashMap<>();
            for (UUID id : ids) {
                r.put(id, true);
            }
            return r;
        });
        // 기본 lookup 미스 (각 테스트가 필요 시 stub 추가)
        lenient().when(partnerLookupClient.findPartnerCodeByName(anyString())).thenReturn(Optional.empty());
        // TM PR-D Part 3 — verifyPartnerCode 도 기본 미스 (코드 우선 매핑 시나리오 테스트가 별도 stub).
        lenient().when(partnerLookupClient.verifyPartnerCode(anyString())).thenReturn(Optional.empty());

        repository.deleteAll();
    }

    @Test
    void create_returns_201() throws Exception {
        ChatRoomMappingCreateRequest req = new ChatRoomMappingCreateRequest(
                "P-001", "에어디자이너 주식회사", "에어디자이너 발주방");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.partnerCode").value("P-001"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.chatRoomName").value("에어디자이너 발주방"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.source").value("MANUAL"));
    }

    @Test
    void list_returns_200() throws Exception {
        // 1건 등록
        ChatRoomMappingCreateRequest req = new ChatRoomMappingCreateRequest(
                "P-002", "제이시스템 주식회사", "제이시스템 발주방");
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].partnerCode").value("P-002"));
    }

    @Test
    void create_duplicate_returns_409() throws Exception {
        ChatRoomMappingCreateRequest req = new ChatRoomMappingCreateRequest(
                "P-003", "중복테스트 주식회사", "중복 발주방");
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isConflict())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void importCsv_preserves_lookup_miss_as_legacy_alias() throws Exception {
        when(partnerLookupClient.findPartnerCodeByName("에어디자이너 주식회사")).thenReturn(Optional.of("P-A"));
        when(partnerLookupClient.findPartnerCodeByName("주식회사 제이시스템")).thenReturn(Optional.of("P-B"));
        // "미등록 주식회사" 는 조회 실패 → deterministic legacy alias 보존

        String csv = "﻿이카운트 사업자명,카톡방,생성 일시\n"
                + "에어디자이너 주식회사,에어디자이너(구 지에스) 발주방,2026년 4월 26일 오전 7:34\n"
                + "주식회사 제이시스템,제이시스템 발주방,2026년 4월 26일 오전 7:34\n"
                + "미등록 주식회사,미등록 발주방,2026년 4월 26일 오전 7:34\n";

        MockMultipartFile file = new MockMultipartFile(
                "file", "import.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(MockMvcRequestBuilders.multipart("/api/v1/notification/admin/chat-rooms/import")
                        .file(file)
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.inserted").value(3))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.updated").value(0))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.rejected.length()").value(0));
    }

    @Test
    void delete_returns_200() throws Exception {
        // 1건 등록
        ChatRoomMappingCreateRequest req = new ChatRoomMappingCreateRequest(
                "P-DEL", "삭제테스트 주식회사", "삭제 발주방");
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();

        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asText();

        mockMvc.perform(MockMvcRequestBuilders.delete("/api/v1/notification/admin/chat-rooms/" + id)
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }
    @Test
    void internal_list_with_valid_token_returns_same_shape_as_admin_list() throws Exception {
        ChatRoomMappingCreateRequest req = new ChatRoomMappingCreateRequest(
                "P-INT", "내부테스트거래처", "내부테스트 발주방");
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/notification/admin/chat-rooms")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/internal/notification/admin/chat-rooms")
                        .header("X-Internal-Token", "test-internal-token")
                        .param("partnerCode", "P-INT"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].partnerCode").value("P-INT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].chatRoomName").value("내부테스트 발주방"));
    }

    @Test
    void internal_list_without_token_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/notification/admin/chat-rooms"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }
}
