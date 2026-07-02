package com.samhanair.logis.slip.realtime;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * 배차현황 목록 레벨 실시간 동기화 채널 상수 (E2 기둥1).
 *
 * <p>개별 DispatchTask UUID 가 아닌 목록 전체 invalidate 용 well-known 합성 채널이다.
 * FE 는 이 채널 하나만 구독하여 배차 생성/수정/삭제/상태변경 시 목록을 refetch 한다.
 */
public final class DispatchBoardRealtime {

    private DispatchBoardRealtime() {
    }

    /** 배차현황 목록 브로드캐스트 채널 (결정적 합성 UUID). */
    public static final UUID CHANNEL_ID = UUID.nameUUIDFromBytes(
            "dispatch:board:changed".getBytes(StandardCharsets.UTF_8));

    /** 배차 목록 변경 이벤트명. */
    public static final String EVENT_CHANGED = "dispatch:board:changed";
}
