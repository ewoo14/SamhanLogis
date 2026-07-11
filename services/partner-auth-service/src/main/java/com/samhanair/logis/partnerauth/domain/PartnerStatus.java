package com.samhanair.logis.partnerauth.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 파트너 인증 상태 (10 enum — 설계서 §3 / Code.js 매핑).
 *
 * <p>설계서 표 §3 의 8개 응답 status 와 entity 내부 상태를 합치면 총 10개:
 * <ul>
 *   <li>{@link #NOT_FOUND_SYSTEM} — 시스템에 파트너 자체가 존재하지 않음</li>
 *   <li>{@link #NOT_FOUND_AUTH} — M3 거래처는 있으나 본 서비스에 PartnerAuth 없음</li>
 *   <li>{@link #PENDING} — 가입 신청, 관리자 승인 대기</li>
 *   <li>{@link #LOCKED} — 비밀번호 3회 연속 실패 락 (legacy Code.js:2847 그대로)</li>
 *   <li>{@link #LONG_UNUSED} — 30일 슬라이딩 만료 (legacy Code.js:2957 그대로)</li>
 *   <li>{@link #ACCESS_DENIED} — 관리자 차단</li>
 *   <li>{@link #PW_EXPIRED} — 비밀번호 90일 강제 변경 만료</li>
 *   <li>{@link #NEED_PW_SET} — 임시 비밀번호 발급 직후 — 본 비밀번호 설정 필요</li>
 *   <li>{@link #NEED_PW_INPUT} — 정상 활성, 비밀번호 입력 대기</li>
 *   <li>{@link #OK} — 로그인 성공 후 응답값 (entity 저장 X — login response only)</li>
 * </ul>
 */
@Getter
@RequiredArgsConstructor
public enum PartnerStatus {
    NOT_FOUND_SYSTEM("등록되지 않은 거래처"),
    NOT_FOUND_AUTH("인증 정보 없음"),
    PENDING("가입 승인 대기중"),
    LOCKED("계정 잠김"),
    LONG_UNUSED("장기미발주"),
    ACCESS_DENIED("접근제한"),
    PW_EXPIRED("비밀번호 만료"),
    NEED_PW_SET("비밀번호 설정 필요"),
    NEED_PW_INPUT("비밀번호 입력 대기"),
    OK("정상");

    private final String displayName;
}
