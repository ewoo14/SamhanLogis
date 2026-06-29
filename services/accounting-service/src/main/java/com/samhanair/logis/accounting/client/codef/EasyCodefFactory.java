package com.samhanair.logis.accounting.client.codef;

import com.samhanair.logis.accounting.config.CodefProperties;
import io.codef.api.EasyCodef;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** easyCodef SDK 싱글톤을 구성한다. */
@Configuration
@ConditionalOnProperty(name = "codef.submit-method", havingValue = "CODEF")
public class EasyCodefFactory {

    /**
     * 토큰 캐시를 보유하는 EasyCodef SDK 인스턴스를 생성한다.
     *
     * <p>SDK 1.0.6의 SANDBOX 서비스 타입은 내장 clientId/clientSecret을 사용하므로
     * {@code setClientInfo} 또는 {@code setClientInfoForDemo}를 호출하지 않는다.
     *
     * @param properties CODEF 설정
     * @return EasyCodef 싱글톤 bean
     */
    @Bean
    public EasyCodef easyCodef(CodefProperties properties) {
        EasyCodef easyCodef = new EasyCodef();
        if (hasText(properties.getPublicKey())) {
            easyCodef.setPublicKey(properties.getPublicKey().trim());
        }
        return easyCodef;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
