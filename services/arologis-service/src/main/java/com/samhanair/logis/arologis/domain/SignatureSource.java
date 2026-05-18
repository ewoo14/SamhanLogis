package com.samhanair.logis.arologis.domain;

/**
 * 전자서명 소스 — Phase 10 W10-1 (W10-2 확장).
 *
 * <p>slip-service 와의 연동은 W10-4 시점.
 *
 * <ul>
 *   <li>{@link #LINK} — 카톡 / SMS 링크 기반 외부 기사 서명 (어플 미설치)</li>
 *   <li>{@link #APP} — 본 어플 (INTERNAL Driver) 직접 서명 + GPS 캡처</li>
 *   <li>{@link #EXTERNAL_INSUNG_LBS} — 인성데이타 퀵프로그램 LBS 기반 GPS + 전자서명 (W10-2)</li>
 * </ul>
 */
public enum SignatureSource {
    LINK,
    APP,
    /** 인성데이타 퀵프로그램 LBS 기반 GPS + 전자서명 — Phase 10 W10-2. */
    EXTERNAL_INSUNG_LBS
}
