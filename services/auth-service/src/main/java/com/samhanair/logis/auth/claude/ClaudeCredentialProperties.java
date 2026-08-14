package com.samhanair.logis.auth.claude;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Claude 모델 호출에 필요한 외부 자격과 모델 설정. */
@ConfigurationProperties(prefix = "anthropic")
public record ClaudeCredentialProperties(
        String apiKey,
        String model,
        String apiUrl) {

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public String effectiveModel() {
        return model == null || model.isBlank() ? "claude-sonnet-5" : model;
    }

    public String effectiveApiUrl() {
        return apiUrl == null || apiUrl.isBlank()
                ? "https://api.anthropic.com/v1/messages"
                : apiUrl;
    }
}
