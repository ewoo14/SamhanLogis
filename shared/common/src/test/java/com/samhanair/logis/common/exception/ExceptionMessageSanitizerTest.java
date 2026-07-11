package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ExceptionMessageSanitizerTest {

    private static final String UUID = "123e4567-e89b-12d3-a456-426614174000";

    @Test
    void null_메시지는_null을_반환한다() {
        assertThat(ExceptionMessageSanitizer.sanitize(null)).isNull();
    }

    @Test
    void 콜론_뒤_uuid와_trailing_잔재를_제거한다() {
        assertThat(ExceptionMessageSanitizer.sanitize("복원 대상 버전을 찾을 수 없습니다: " + UUID))
                .isEqualTo("복원 대상 버전을 찾을 수 없습니다");
    }

    @Test
    void 따옴표로_감싼_uuid와_주변_공백을_제거한다() {
        assertThat(ExceptionMessageSanitizer.sanitize("창고 '" + UUID + "'"))
                .isEqualTo("창고");
        assertThat(ExceptionMessageSanitizer.sanitize("창고 \"" + UUID + "\""))
                .isEqualTo("창고");
    }

    @Test
    void trailing_여는괄호와_연속공백을_정리한다() {
        assertThat(ExceptionMessageSanitizer.sanitize("스냅샷 손상 (  " + UUID + "  "))
                .isEqualTo("스냅샷 손상");
    }

    @Test
    void 업무번호와_uuid가_아닌_값은_보존한다() {
        assertThat(ExceptionMessageSanitizer.sanitize("손상된 버전 스냅샷입니다 (버전 5)"))
                .isEqualTo("손상된 버전 스냅샷입니다 (버전 5)");
        assertThat(ExceptionMessageSanitizer.sanitize("전표 SLIP-2026-0001, lineNo=3"))
                .isEqualTo("전표 SLIP-2026-0001, lineNo=3");
    }

    @Test
    void uuid_정규식에_맞지_않는_uuid_유사문자열은_보존한다() {
        assertThat(ExceptionMessageSanitizer.sanitize("partner-001-uuid g-uuid-1"))
                .isEqualTo("partner-001-uuid g-uuid-1");
    }
}
