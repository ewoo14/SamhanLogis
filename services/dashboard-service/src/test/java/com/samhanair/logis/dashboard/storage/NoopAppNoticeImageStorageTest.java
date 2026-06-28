package com.samhanair.logis.dashboard.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** Noop 저장소 운영 profile 기동 가드 회귀 (Codex 재리뷰 지적 — 조회/기동 경로 silent 깨짐 차단). */
class NoopAppNoticeImageStorageTest {

    @Test
    void 운영_profile_에서는_기동_가드가_예외로_부팅을_중단한다() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        NoopAppNoticeImageStorage storage = new NoopAppNoticeImageStorage(env);

        assertThatThrownBy(storage::guardOperationalProfile)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("기동을 중단");
    }

    @Test
    void staging_profile_에서도_기동_가드가_예외를_던진다() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("docker", "staging");
        NoopAppNoticeImageStorage storage = new NoopAppNoticeImageStorage(env);

        assertThatThrownBy(storage::guardOperationalProfile)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 비운영_profile_에서는_가드_통과_및_placeholder_는_object_key_를_노출하지_않는다() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("dev");
        NoopAppNoticeImageStorage storage = new NoopAppNoticeImageStorage(env);

        assertThatCode(storage::guardOperationalProfile).doesNotThrowAnyException();
        assertThat(storage.presignedGetUrl("app-notices/notice-1/img.png")).doesNotContain("app-notices/");
    }
}
