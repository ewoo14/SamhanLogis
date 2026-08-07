package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * V9 dev seed 의 QA_AROLOGIS_ADMIN_PASSWORD BCrypt strength 10 해시 검증 — 2026-05-14 분리.
 *
 * <p>본 테스트는 V9 seed 의 password_hash 값이 QA_AROLOGIS_ADMIN_PASSWORD 와 매칭됨을 검증한다. 본 해시는
 * V9__seed_arologis_master.sql 의 hard-coded 값과 일치해야 한다. 만약 BCrypt 해시를 갱신해야
 * 한다면 {@link #generate_arologis_seed_hash_helper()} 의 출력을 V9 SQL 에 반영.
 */
class BcryptHashGenTest {

    /** V9 seed 의 hard-coded password_hash (QA_AROLOGIS_ADMIN_PASSWORD BCrypt strength 10). */
    private static final String V9_SEED_HASH =
            "$2a$10$EtZy/ChJX19rLJJ0pomWhuaWs/ii5yP9/RX1XU.vkegdiR4Rrg9gi";

    @Test
    void v9_seed_hash_matches_arologis_seed_password() {
        BCryptPasswordEncoder enc = new BCryptPasswordEncoder(10);
        String password = System.getenv("QA_AROLOGIS_ADMIN_PASSWORD");
        assertThat(password).as("QA_AROLOGIS_ADMIN_PASSWORD 환경변수가 필요함").isNotBlank();
        assertThat(enc.matches(password, V9_SEED_HASH))
                .as("V9 seed BCrypt hash 가 QA_AROLOGIS_ADMIN_PASSWORD 와 매칭되어야 함")
                .isTrue();
    }
}
