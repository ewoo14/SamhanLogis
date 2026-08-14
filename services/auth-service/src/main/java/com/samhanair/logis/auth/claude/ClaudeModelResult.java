package com.samhanair.logis.auth.claude;

/** 한 번의 Claude 호출에서 반환되는 답변과 목록용 한 줄 요약. */
public record ClaudeModelResult(String summary, String answer) {
    public ClaudeModelResult {
        summary = normalizeSummary(summary);
    }

    private static String normalizeSummary(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 77).trim() + "...";
    }
}
