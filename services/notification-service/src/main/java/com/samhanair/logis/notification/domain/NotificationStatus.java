package com.samhanair.logis.notification.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 발송 요청 라이프사이클 상태.
 *
 * <ul>
 *   <li>{@link #PENDING} — 요청 등록 직후 (게이트웨이 호출 전).</li>
 *   <li>{@link #SENT} — 게이트웨이 호출 성공 (정상 전달).</li>
 *   <li>{@link #FAILED} — 게이트웨이 응답 실패 (재시도 한도 초과 종료).</li>
 *   <li>{@link #RETRYING} — 1회 이상 실패 후 재시도 진행 중.</li>
 * </ul>
 *
 * <p>SENT / FAILED 는 종료 상태 — 재시도 호출 거부 (FAILED 만 admin 명시 retry 허용).
 */
@Getter
@RequiredArgsConstructor
public enum NotificationStatus {

    PENDING("발송대기"),
    SENT("성공"),
    FAILED("실패"),
    RETRYING("재시도중");

    private final String displayName;
}
