package com.samhanair.logis.collab.coedit;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 문서 협업 텍스트 CRDT update relay.
 *
 * <p>서버는 Yjs update 를 해석하지 않고 opaque base64 byte 로만 저장·중계한다.
 *
 * <p><b>운영 제약</b>: 노드-로컬 in-memory 라 서비스 재시작 시 누적 update 가 소실되고,
 * 문서 삭제 시에도 entry 가 자동 회수되지 않는다. 다중 노드는 sticky-session 또는 registry 외부화가
 * 필요하다. payload 는 {@link #MAX_PAYLOAD_LENGTH} 로 제한해 메모리/대역폭 폭증을 방지한다.
 */
public class CollabCoeditService {

    public static final String EVENT_UPDATE = "coedit:update";
    public static final String EVENT_AWARENESS = "coedit:awareness";

    private static final int MAX_UPDATES_PER_DOCUMENT = 5_000;
    /** base64 payload 1건 최대 길이(문자, 약 128KB) — 초과 시 거부해 메모리/대역폭 DoS 를 방지한다. */
    public static final int MAX_PAYLOAD_LENGTH = 128 * 1024;
    private static final int MAX_TOTAL_PAYLOAD_LENGTH_PER_DOCUMENT = 1024 * 1024;

    private final RealtimeBroker broker;
    private final Map<UUID, CopyOnWriteArrayList<String>> updatesByDocument = new ConcurrentHashMap<>();

    public CollabCoeditService(RealtimeBroker broker) {
        this.broker = broker;
    }

    /** base64 Yjs update 를 누적하고 같은 문서 SSE 채널로 중계한다. */
    public void appendUpdate(UUID documentId, String update) {
        String normalized = requireBase64(update, "coedit update 는 필수입니다");
        CopyOnWriteArrayList<String> updates = updatesByDocument.computeIfAbsent(
                documentId, ignored -> new CopyOnWriteArrayList<>());
        // 서버가 Yjs update 를 병합하지 않는 현재 relay 에서는 prefix update 삭제 시 신규 접속자 snapshot 계약이 깨진다.
        synchronized (updates) {
            if (updates.size() >= MAX_UPDATES_PER_DOCUMENT
                    || totalPayloadLength(updates) + normalized.length() > MAX_TOTAL_PAYLOAD_LENGTH_PER_DOCUMENT) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "coedit snapshot 누적 한도를 초과했습니다");
            }
            updates.add(normalized);
        }
        broker.publish(documentId, EVENT_UPDATE, Map.of("update", normalized));
    }

    /** 신규 접속자의 Y.Doc 재구성을 위한 누적 update snapshot. */
    public List<String> listUpdates(UUID documentId) {
        return new ArrayList<>(updatesByDocument.getOrDefault(documentId, new CopyOnWriteArrayList<>()));
    }

    /** cursor/selection awareness 는 저장하지 않고 동일 SSE 채널로만 중계한다. */
    public void publishAwareness(UUID documentId, String awareness) {
        String normalized = requireBase64(awareness, "coedit awareness 는 필수입니다");
        broker.publish(documentId, EVENT_AWARENESS, Map.of("awareness", normalized));
    }

    private String requireBase64(String value, String blankMessage) {
        String normalized = value == null ? null : value.trim();
        if (normalized == null || normalized.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, blankMessage);
        }
        if (normalized.length() > MAX_PAYLOAD_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "coedit payload 가 허용 크기를 초과했습니다");
        }
        try {
            Base64.getDecoder().decode(normalized);
            return normalized;
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "base64 payload 형식이 올바르지 않습니다");
        }
    }

    private static int totalPayloadLength(List<String> updates) {
        int total = 0;
        for (String update : updates) {
            total += update.length();
        }
        return total;
    }
}
