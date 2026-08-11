package com.samhanair.logis.slip.security;

import com.samhanair.logis.common.security.ActorDisplayName;
import java.util.UUID;

/** actorName 이 해당 행의 actorId UUID를 표현하는지 판정하는 공통 경계 helper. */
public final class ActorNameSanitizer {

    private ActorNameSanitizer() {
    }

    /**
     * 표시 후보가 어떤 UUID를 표현하든 true를 반환한다.
     * actorId는 기존 호출 계약과 내부 audit 조인을 위해 유지하지만, 화면 경계에서는 다른 UUID도
     * 사람 이름이 아니므로 함께 차단한다.
     */
    public static boolean representsActorId(String actorName, UUID actorId) {
        return ActorDisplayName.isUuid(actorName);
    }
}
