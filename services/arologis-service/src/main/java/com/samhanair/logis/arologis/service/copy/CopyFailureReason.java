package com.samhanair.logis.arologis.service.copy;

/**
 * 사본 PNG 합성/저장/응답 실패 사유 — Phase F (D-DF-05/06/10).
 *
 * <p>응답 200 + JSON 형태로 반환되며, 사용자가 같은 endpoint 재호출 가능 (copy_sent_at 미설정).
 * RECIPIENT_PHONE_MISSING 만 Tx2 진입 전 분기, 나머지는 Tx2 c/d 단계 실패.
 */
public enum CopyFailureReason {
    /** slip recipientPhoneNumber == null 또는 blank. */
    RECIPIENT_PHONE_MISSING,
    /** Playwright Chromium 렌더 timeout (config: playwright.copy.timeout-ms). */
    RENDERER_TIMEOUT,
    /** Playwright 기타 오류 (Chromium crash, page eval 실패). */
    RENDERER_ERROR,
    /** disk 저장 실패 (디스크 가득, 권한 등). */
    STORAGE_FULL
}
