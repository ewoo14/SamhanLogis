package com.samhanair.logis.slip.estimate.snapshot.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;

/**
 * 종합견적서 저장 요청 — legacy saveQuoteSnapshot(payload) 계약 정합.
 *
 * <p>웹 estimate-app lib/code.js saveQuoteSnapshot 가 보내는 body:
 * <pre>{ userEmail, createdAt, data, summary: { custName, ... }, image }</pre>
 *
 * <ul>
 *   <li>{@code userEmail} — 저장 담당자 이메일 (legacy Session.getActiveUser().getEmail())</li>
 *   <li>{@code createdAt} — ISO-8601 저장시각 (legacy nowStr). null 이면 서버 now 사용</li>
 *   <li>{@code data} — 작업상태 전체 base64 JSON blob (필수)</li>
 *   <li>{@code summary} — 요약 객체. custName 만 추출, 그 외 무시</li>
 *   <li>{@code image} — 미리보기 base64 (선택)</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SaveQuoteSnapshotRequest(
        @NotBlank String userEmail,
        String createdAt,
        @NotBlank String data,
        Summary summary,
        String image) {

    /** legacy payload.summary — custName 만 사용, 나머지 필드는 무시(ignoreUnknown). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Summary(String custName) {
    }

    /** summary 가 null 이거나 custName 미지정 시 null 반환. */
    public String custNameOrNull() {
        return summary == null ? null : summary.custName();
    }
}
