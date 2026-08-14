package com.samhanair.logis.auth.claude;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/** Anthropic Messages API 호출 구현. 사용자 질문만 전송하며 업무 API/DB 접근은 하지 않는다. */
@Component
@ConditionalOnProperty(name = "claude.virtual-agent.enabled", havingValue = "false", matchIfMissing = true)
public class AnthropicClaudeModelClient implements ClaudeModelClient {

    private final ClaudeCredentialProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public AnthropicClaudeModelClient(ClaudeCredentialProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public String ask(String question) {
        return send(question);
    }

    @Override
    public ClaudeModelResult askWithSummary(String question) {
        String raw = send(question + "\\n\\n응답 첫 줄에 [SUMMARY]와 [/SUMMARY] 사이에 대화 내용을 80자 이내 한 줄로 요약하고, 다음 줄부터 답변을 작성하세요.");
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("(?s)\\[SUMMARY\\]\\s*(.*?)\\s*\\[/SUMMARY\\]\\s*(.*)")
                .matcher(raw.trim());
        if (matcher.matches()) return new ClaudeModelResult(matcher.group(1), matcher.group(2).trim());
        return new ClaudeModelResult(raw.split("\\R", 2)[0], raw);
    }

    private String send(String question) {
        String json = "{\"model\":\"" + escape(properties.effectiveModel())
                + "\",\"max_tokens\":1024,\"messages\":[{\"role\":\"user\",\"content\":\""
                + escape(question) + "\"}]}";
        HttpRequest request = HttpRequest.newBuilder(URI.create(properties.effectiveApiUrl()))
                .header("x-api-key", properties.apiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new IllegalStateException("Anthropic API 호출 실패: HTTP " + response.statusCode());
            }
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode content = root.path("content");
            if (!content.isArray() || content.isEmpty() || !content.get(0).hasNonNull("text")) {
                throw new IllegalStateException("Anthropic 응답에 텍스트가 없습니다.");
            }
            return content.get(0).get("text").asText();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Anthropic API 호출이 중단되었습니다.", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Anthropic API 호출에 실패했습니다.", ex);
        }
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
