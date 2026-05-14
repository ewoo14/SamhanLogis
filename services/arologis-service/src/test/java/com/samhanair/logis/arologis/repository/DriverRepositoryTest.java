package com.samhanair.logis.arologis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.it.AbstractPostgresIT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * DriverRepository 활성 phoneNumber lookup 검증 — 2026-05-14 분리.
 *
 * <p>passwordless driver login 진입점 ({@code findByPhoneNumberAndIsDeletedFalse}) 의 활성/
 * Soft Delete 격리.
 */
@SpringBootTest
@Transactional
class DriverRepositoryTest extends AbstractPostgresIT {

    @Autowired
    private DriverRepository repo;

    @Test
    void find_by_phone_number_active_returns_present() {
        Driver d = Driver.of("D-T001", "01011112222", "1톤", DriverSource.INTERNAL, false, null);
        repo.save(d);

        assertThat(repo.findByPhoneNumberAndIsDeletedFalse("01011112222")).isPresent();
    }

    @Test
    void soft_deleted_driver_excluded_from_active_phone_lookup() {
        Driver d = Driver.of("D-T002", "01033334444", "1톤", DriverSource.INTERNAL, false, null);
        d.markDeleted("system");
        repo.save(d);

        assertThat(repo.findByPhoneNumberAndIsDeletedFalse("01033334444")).isEmpty();
    }
}
