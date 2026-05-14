package com.samhanair.logis.arologis.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.it.AbstractPostgresIT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * AdminUserRepository 검증 — 2026-05-14 분리.
 *
 * <p>활성 행 조회 / Soft Delete 제외 / partial unique index 의 Soft Delete 재활성 허용.
 */
@SpringBootTest
@Transactional
class AdminUserRepositoryTest extends AbstractPostgresIT {

    @Autowired
    private AdminUserRepository repo;

    @Test
    void save_and_lookup_by_loginId_active() {
        AdminUser u = AdminUser.create(
                "admin", "$2a$10$bcrypthashplaceholder", "관리자", AdminUserRole.AROLOGIS_MASTER);
        repo.save(u);

        assertThat(repo.findByLoginIdAndIsDeletedFalse("admin")).isPresent();
    }

    @Test
    void soft_deleted_excluded() {
        AdminUser u = AdminUser.create(
                "softdel", "$2a$10$h", "n", AdminUserRole.AROLOGIS_MANAGER);
        u.markDeleted("system");
        repo.save(u);

        assertThat(repo.findByLoginIdAndIsDeletedFalse("softdel")).isEmpty();
    }

    @Test
    void partial_unique_loginId_allows_reactivation_after_soft_delete() {
        AdminUser u1 = AdminUser.create(
                "dup", "$2a$10$h", "n", AdminUserRole.AROLOGIS_MANAGER);
        u1.markDeleted("system");
        repo.saveAndFlush(u1);

        AdminUser u2 = AdminUser.create(
                "dup", "$2a$10$h", "n", AdminUserRole.AROLOGIS_MANAGER);
        assertThatCode(() -> repo.saveAndFlush(u2)).doesNotThrowAnyException();
    }
}
