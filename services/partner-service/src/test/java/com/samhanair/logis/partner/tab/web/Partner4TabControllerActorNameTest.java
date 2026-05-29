package com.samhanair.logis.partner.tab.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link Partner4TabController#displayNameOrNull(String)} UUID 비공개 가드 단위 테스트.
 *
 * <p>권한 재편 Phase 2.3 F4 회귀 방지 — 헤더 인증 환경에서 {@code Principal.getName()} 으로
 * 계정 UUID 가 들어오면 버전이력 actorName 으로 노출되어서는 안 된다([[uuid-no-user-visibility]]).
 * 게이트웨이가 X-User-Name 을 전파하지 않아 실제로 발생했던 누출을 가드한다.
 */
class Partner4TabControllerActorNameTest {

    @Test
    @DisplayName("UUID 형태 식별자는 actorName 으로 노출하지 않고 null 반환")
    void uuidIsHidden() {
        assertThat(Partner4TabController.displayNameOrNull("a0000000-0000-0000-0000-000000000001"))
                .isNull();
        // 대문자 UUID 도 차단
        assertThat(Partner4TabController.displayNameOrNull("A0000000-0000-0000-0000-000000000001"))
                .isNull();
        // 앞뒤 공백 포함 UUID 도 차단
        assertThat(Partner4TabController.displayNameOrNull("  a0000000-0000-0000-0000-000000000001  "))
                .isNull();
    }

    @Test
    @DisplayName("실제 표시명은 그대로 통과")
    void realDisplayNamePassesThrough() {
        assertThat(Partner4TabController.displayNameOrNull("개발마스터")).isEqualTo("개발마스터");
        assertThat(Partner4TabController.displayNameOrNull("dev-master")).isEqualTo("dev-master");
    }

    @Test
    @DisplayName("null/공백 식별자는 null")
    void blankIsNull() {
        assertThat(Partner4TabController.displayNameOrNull(null)).isNull();
        assertThat(Partner4TabController.displayNameOrNull("")).isNull();
        assertThat(Partner4TabController.displayNameOrNull("   ")).isNull();
    }
}
