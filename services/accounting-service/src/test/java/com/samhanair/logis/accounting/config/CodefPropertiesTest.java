package com.samhanair.logis.accounting.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** CODEF connectedId 등록 설정 바인딩 회귀 테스트. */
class CodefPropertiesTest {

    @Test
    @DisplayName("CODEF RSA 공개키와 sandbox base-url 설정 필드를 보유한다")
    void codefConnectionProperties_havePublicKeyAndSandboxBaseUrl() {
        CodefProperties properties = new CodefProperties();
        ReflectionTestUtils.setField(properties, "publicKey", "public-key");
        ReflectionTestUtils.setField(properties, "sandboxBaseUrl", "https://development.codef.io");

        assertThat(properties.getPublicKey()).isEqualTo("public-key");
        assertThat(properties.getSandboxBaseUrl()).isEqualTo("https://development.codef.io");
    }
}
