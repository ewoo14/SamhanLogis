package com.samhanair.logis.user.service;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * 임시 비밀번호 생성기 — Phase 10 P0-5 신규 직원 등록.
 *
 * <p>정책:
 * <ul>
 *   <li>길이: 10자 고정</li>
 *   <li>구성: 영문 대소문자 + 숫자 혼합</li>
 *   <li>최소 조건: 영문 1자 + 숫자 1자 이상 보장 (retry 로직 포함)</li>
 *   <li>난수: {@link SecureRandom} — 예측 불가 (crypto-strong)</li>
 * </ul>
 *
 * <p>생성된 임시 비밀번호는 auth-service 에 BCrypt 해시로 저장되며, 클라이언트 응답에서는
 * 단 1회 평문으로 반환 (관리자가 직원에게 구두 또는 메일로 전달). 첫 로그인 후
 * {@code passwordChangeRequired} 플래그로 인해 비밀번호 변경이 강제됨.
 */
@Component
public class TemporaryPasswordGenerator {

    private static final String UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijklmnopqrstuvwxyz";
    private static final String DIGITS = "0123456789";
    private static final String ALL = UPPER + LOWER + DIGITS;
    private static final int LENGTH = 10;

    private final SecureRandom random = new SecureRandom();

    /**
     * 임시 비밀번호 생성 — 영문 대소문자 + 숫자 10자.
     *
     * <p>영문 1자 이상 + 숫자 1자 이상 보장: 첫 두 자리는 각각 영문/숫자에서 강제 선택 후
     * 나머지 8자는 전체 pool 에서 random 선택, 이후 shuffle.
     *
     * @return 10자 임시 비밀번호 (평문)
     */
    public String generate() {
        char[] pw = new char[LENGTH];
        // 최소 조건 보장: 위치 0 = 영문, 위치 1 = 숫자
        pw[0] = UPPER.charAt(random.nextInt(UPPER.length()));
        pw[1] = DIGITS.charAt(random.nextInt(DIGITS.length()));
        for (int i = 2; i < LENGTH; i++) {
            pw[i] = ALL.charAt(random.nextInt(ALL.length()));
        }
        // Fisher-Yates shuffle — 위치 편향 제거
        for (int i = LENGTH - 1; i > 0; i--) {
            int j = random.nextInt(i + 1);
            char tmp = pw[i];
            pw[i] = pw[j];
            pw[j] = tmp;
        }
        return new String(pw);
    }
}
