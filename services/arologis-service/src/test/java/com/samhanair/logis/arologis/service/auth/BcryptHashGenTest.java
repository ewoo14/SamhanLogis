package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * V9 dev seed 의 BCrypt strength 10 해시 검증 — 2026-05-14 분리.
 *
 * <p>본 테스트는 V9 seed 의 password_hash 값이 승인된 seed 해시와 일치함을 검증한다. 비밀번호
 * 평문은 테스트나 저장소에 필요하지 않다.
 */
class BcryptHashGenTest {

    /** V9 seed 의 hard-coded BCrypt password_hash. */
    private static final String V9_SEED_HASH =
            "$2a$10$EtZy/ChJX19rLJJ0pomWhuaWs/ii5yP9/RX1XU.vkegdiR4Rrg9gi";

    @Test
    void v9_seed_hash_is_stable() throws IOException {
        try (InputStream migration = getClass().getResourceAsStream(
                "/db/migration/V9__seed_arologis_master.sql")) {
            assertThat(migration).as("V9 seed migration resource 가 필요함").isNotNull();
            String sql = new String(migration.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql)
                    .as("V9 seed migration 은 승인된 BCrypt hash 를 포함해야 함")
                    .contains(V9_SEED_HASH);
        }
    }
}
