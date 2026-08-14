package com.samhanair.logis.auth.claude;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.Set;
import lombok.Data;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 라이브 QA 전용 가상 에이전트 설정. 운영 프로파일에서는 활성화할 수 없다. */
@Data
@ConfigurationProperties(prefix = "claude.virtual-agent")
public class ClaudeVirtualAgentProperties implements EnvironmentAware {

    private static final Set<String> PRODUCTION_PROFILES = Set.of("prod", "production");
    private boolean enabled = false;
    private Environment environment;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void verify() {
        if (enabled && environment != null && Arrays.stream(environment.getActiveProfiles())
                .map(String::toLowerCase).anyMatch(PRODUCTION_PROFILES::contains)) {
            throw new IllegalStateException("운영 프로파일에서는 가상 에이전트를 켤 수 없습니다.");
        }
    }
}
