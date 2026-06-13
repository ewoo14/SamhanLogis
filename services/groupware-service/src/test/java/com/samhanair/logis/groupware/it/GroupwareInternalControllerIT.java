package com.samhanair.logis.groupware.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Internal endpoint 인증 / lookup 시나리오 (4 case).
 *
 * <ol>
 *   <li>X-Internal-Token 누락 → 403 (Spring Security 기본 — 인증 미적재 + protected endpoint)</li>
 *   <li>X-Internal-Token 불일치 → 401 (InternalTokenFilter 가 직접 401 응답)</li>
 *   <li>X-Internal-Token 일치 + 존재하는 결재선 → 200, approvalId / requesterId / status</li>
 *   <li>X-Internal-Token 일치 + 미존재 결재선 → 404</li>
 * </ol>
 *
 * <p>UserClient = {@code @MockBean} 격리 (memory feedback_it_mockbean_external_clients) — 본
 * IT 의 결재선 fixture seed 시 user 검증을 통과시키기 위해 lenient setup.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
class GroupwareInternalControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApprovalLineRepository approvalLineRepository;

    @MockBean
    private UserClient userClient;

    private UUID seededApprovalId;

    @BeforeEach
    void seedFixture() {
        lenient().when(userClient.exists(any())).thenReturn(true);
        // Phase 9 W3 — bulk verify 채택. 모든 입력 ID 를 true 매핑하여 통과시킨다.
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            java.util.List<java.util.UUID> ids = inv.getArgument(0);
            java.util.Map<java.util.UUID, Boolean> result = new java.util.HashMap<>();
            for (java.util.UUID id : ids) {
                result.put(id, true);
            }
            return result;
        });
        approvalLineRepository.deleteAll();
        ApprovalLine line = ApprovalLine.open(
                "2099/01/01-1", UUID.randomUUID(), "Internal IT 결재선", "본문");
        line.appendStep(UUID.randomUUID());
        ApprovalLine saved = approvalLineRepository.save(line);
        seededApprovalId = saved.getId();
    }

    @Test
    void approval_lookup_without_token_returns_403() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/groupware/approvals/" + seededApprovalId))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void approval_lookup_with_invalid_token_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/groupware/approvals/" + seededApprovalId)
                        .header("X-Internal-Token", "wrong-token"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void approval_lookup_with_valid_token_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/groupware/approvals/" + seededApprovalId)
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.title").value("Internal IT 결재선"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("PENDING"));
    }

    @Test
    void approval_lookup_with_valid_token_but_missing_id_returns_404() throws Exception {
        UUID missing = UUID.randomUUID();
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/groupware/approvals/" + missing)
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(MockMvcResultMatchers.status().isNotFound())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("NOT_FOUND"));
    }
}
