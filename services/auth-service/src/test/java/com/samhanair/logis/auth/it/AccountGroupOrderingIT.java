package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * C5-1 P2 — 그룹 query ORDER BY(순서 결정성) Testcontainers IT.
 *
 * <p>JWT {@code groups} claim 의 comma-join 순서 결정성을 보장하는
 * {@code findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc} 가 실제 SQL 에서
 * {@code ORDER BY group_id ASC} 를 수행함을 박제한다.
 *
 * <p><b>설계</b>: insertion 순서를 의도적으로 groupId <b>내림차순</b>으로 구성 —
 * ORDER BY 없이 insertion/PK 순서로 반환되면 내림차순이 나와 실패한다.
 * (실 Docker QA `docs/qa/permission-groups-c5-1-p2/real-qa-evidence.md` §2 와 동일 논리의
 * CI 자동 회귀 가드. unique index 플래너 우연 정렬 가능성까지 IT 반복 실행으로 차단.)
 */
@SpringBootTest(classes = AuthServiceApplication.class)
class AccountGroupOrderingIT extends AbstractPostgresIT {

    // 테스트 계정 UUID
    private static final UUID ACCOUNT_ID =
            UUID.fromString("c5100000-0000-0000-0000-000000000001");

    // 테스트 전용 그룹 UUID — 오름차순 기대 순서 = G1 < G2 < G3
    private static final UUID GROUP_1 =
            UUID.fromString("f5100000-0000-0000-0000-000000000001");
    private static final UUID GROUP_2 =
            UUID.fromString("f5100000-0000-0000-0000-000000000002");
    private static final UUID GROUP_3 =
            UUID.fromString("f5100000-0000-0000-0000-000000000003");

    @Autowired
    private AccountGroupRepository accountGroupRepository;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        cleanAll();
        seedAccount();
        seedGroup(GROUP_1, "C5-1 정렬 IT 그룹1");
        seedGroup(GROUP_2, "C5-1 정렬 IT 그룹2");
        seedGroup(GROUP_3, "C5-1 정렬 IT 그룹3");
        // 의도적 내림차순 insertion: G3 → G2 → G1
        assignGroup(GROUP_3);
        assignGroup(GROUP_2);
        assignGroup(GROUP_1);
    }

    @AfterEach
    void tearDown() {
        cleanAll();
    }

    @Test
    @DisplayName("내림차순 insertion 에도 조회 결과는 groupId 오름차순 — ORDER BY 실증")
    void findByAccountId_returnsGroupIdAscending_regardlessOfInsertionOrder() {
        List<UUID> groupIds = accountGroupRepository
                .findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(ACCOUNT_ID)
                .stream()
                .map(ag -> ag.getGroupId())
                .toList();

        assertThat(groupIds)
                .as("insertion 순서(G3→G2→G1)와 무관하게 groupId 오름차순이어야 한다")
                .containsExactly(GROUP_1, GROUP_2, GROUP_3);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private void seedAccount() {
        jdbc.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, role, enabled,
                    failed_login_attempts, locked_at,
                    password_changed_at, password_history,
                    password_change_required,
                    created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (
                    ?, 'c51_ordering',
                    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
                    'C5-1 Ordering', 'SALES', TRUE,
                    0, NULL,
                    NOW(), '[]'::jsonb,
                    FALSE,
                    NOW(), 'it-c51', NOW(), 'it-c51', FALSE
                )
                """, ACCOUNT_ID);
    }

    private void seedGroup(UUID groupId, String name) {
        jdbc.update("""
                INSERT INTO permission_groups
                    (id, name, description, is_builtin, is_system_master,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (?, ?, 'C5-1 P2 ORDER BY IT 전용', FALSE, FALSE,
                     NOW(), 'it-c51', NOW(), 'it-c51', FALSE)
                ON CONFLICT (id) DO NOTHING
                """, groupId, name);
    }

    private void assignGroup(UUID groupId) {
        jdbc.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES
                    (gen_random_uuid(), ?, ?, NOW(), 'it-c51', NOW(), 'it-c51', FALSE)
                ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING
                """, ACCOUNT_ID, groupId);
    }

    private void cleanAll() {
        jdbc.update("DELETE FROM account_groups WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", ACCOUNT_ID);
        for (UUID groupId : new UUID[] {GROUP_1, GROUP_2, GROUP_3}) {
            jdbc.update("DELETE FROM permission_groups WHERE id = ?", groupId);
        }
    }
}
