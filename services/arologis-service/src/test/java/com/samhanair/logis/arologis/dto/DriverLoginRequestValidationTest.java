package com.samhanair.logis.arologis.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Driver 로그인 입력은 정규화 전에 휴대번호 형식을 검증한다. */
class DriverLoginRequestValidationTest {

    private static Validator validator;
    private static ValidatorFactory validatorFactory;

    @BeforeAll
    static void setUpValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    @Test
    void accepts_hyphenated_and_digits_only_mobile_phone() {
        assertThat(violations("010-2000-0001")).isEmpty();
        assertThat(violations("01020000001")).isEmpty();
    }

    @Test
    void rejects_unregistered_shape_before_normalization() {
        assertThat(violations("010-20000001")).isNotEmpty();
        assertThat(violations("010-2000-00001")).isNotEmpty();
        assertThat(violations("010-2000-000a")).isNotEmpty();
    }

    private static Set<?> violations(String phoneNumber) {
        return validator.validate(new DriverLoginRequest(phoneNumber));
    }
}
