package com.samhanair.logis.slip.revision.domain;

/**
 * 전표 버전 스냅샷의 캡처 유형 (권한 재편 Phase 2.1).
 *
 * <ul>
 *   <li>{@link #CREATE} — 전표 최초 생성 (revision 1).</li>
 *   <li>{@link #EDIT} — 헤더/라인 변경 후 캡처.</li>
 *   <li>{@link #RESTORE} — 특정 시점(source revision) 으로의 point-in-time 복원.</li>
 * </ul>
 */
public enum SlipRevisionType {
    CREATE,
    EDIT,
    RESTORE
}
