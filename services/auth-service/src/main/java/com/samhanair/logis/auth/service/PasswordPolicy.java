package com.samhanair.logis.auth.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/**
 * 비밀번호 강도 정책 — Phase 10 P0-2 (manual 06-트러블슈팅/01-로그인-실패.md §1-3).
 *
 * <p>규칙 (전부 만족 필수):
 * <ul>
 *     <li>{@link #MIN_LENGTH} 자 이상 / {@link #MAX_LENGTH} 자 이하</li>
 *     <li>영문 1 자 이상 (대소문자 무관)</li>
 *     <li>숫자 1 자 이상</li>
 *     <li>특수문자 1 자 이상 ({@code !@#$%^&*()...})</li>
 * </ul>
 *
 * <p>위반 시 {@link BusinessException}({@link ErrorCode#INVALID_INPUT}) — 한국어 메시지로 사용자에 직접 노출.
 */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 8;
    /** 최대 길이 — spec (designer) 기준 32자. FE/BE 통일 (PR #138 Q-1 fix). */
    public static final int MAX_LENGTH = 32;

    private static final String SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};':\",./<>?\\|`~";

    private PasswordPolicy() {
        throw new UnsupportedOperationException("Utility class");
    }

    /**
     * 비밀번호 검증 — 위반 시 {@link BusinessException} 발생.
     *
     * @throws BusinessException ErrorCode.INVALID_INPUT — 정책 위반
     */
    public static void validate(String password) {
        if (password == null || password.length() < MIN_LENGTH || password.length() > MAX_LENGTH) {
            throw new BusinessException(
                    ErrorCode.INVALID_INPUT,
                    String.format("비밀번호는 %d 자 이상 %d 자 이하이어야 합니다", MIN_LENGTH, MAX_LENGTH));
        }
        boolean hasLetter = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isLetter(c)) {
                hasLetter = true;
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else if (SPECIAL_CHARS.indexOf(c) >= 0) {
                hasSpecial = true;
            }
        }
        if (!hasLetter || !hasDigit || !hasSpecial) {
            throw new BusinessException(
                    ErrorCode.INVALID_INPUT,
                    "비밀번호는 영문, 숫자, 특수문자를 각각 1 자 이상 포함해야 합니다");
        }
    }

    /** 사용자 노출 정책 설명 (UI {@code GET /auth/password/policy} 렌더링 용). */
    public static String describe() {
        return String.format(
                "비밀번호는 %d 자 이상 %d 자 이하이며, 영문 / 숫자 / 특수문자를 각각 1 자 이상 포함해야 합니다",
                MIN_LENGTH, MAX_LENGTH);
    }
}
