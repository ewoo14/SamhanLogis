package com.samhanair.logis.shared.realtime.lock;

import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.presence.PresenceColor;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * in-memory 필드 soft-lock registry.
 *
 * <p>저장소는 노드-로컬 {@link ConcurrentHashMap} 이고, 이벤트 fan-out 은 기존
 * {@link RealtimeBroker} 채널을 그대로 사용한다. 다중 노드에서는 presence 와 동일하게
 * sticky-session 또는 registry 외부화가 필요하다.
 */
public class InMemoryFieldLockService implements FieldLockService {

    public static final Duration DEFAULT_TTL = Duration.ofMinutes(5);
    private static final String DEFAULT_DISPLAY_NAME = "사용자";
    private static final int MAX_DISPLAY_NAME_LENGTH = 50;
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");
    private static final Comparator<FieldLockEntry> FIELD_LOCK_ORDER =
            Comparator.comparing(FieldLockEntry::lockedAt).reversed()
                    .thenComparing(FieldLockEntry::fieldPath)
                    .thenComparing(FieldLockEntry::displayName)
                    .thenComparing(FieldLockEntry::sessionId);

    private final RealtimeBroker broker;
    private final Duration ttl;
    private final Clock clock;
    private final ConcurrentHashMap<UUID, ConcurrentHashMap<String, CopyOnWriteArrayList<FieldLockEntry>>> entries =
            new ConcurrentHashMap<>();
    // 세션 소유권: documentId -> (sessionId -> userId). release 시 등록자 본인만 해제 가능하도록 검증(PresenceService.owners 패턴).
    private final ConcurrentHashMap<UUID, ConcurrentHashMap<String, String>> owners =
            new ConcurrentHashMap<>();

    public InMemoryFieldLockService(RealtimeBroker broker) {
        this(broker, DEFAULT_TTL, Clock.systemUTC());
    }

    public InMemoryFieldLockService(RealtimeBroker broker, Duration ttl, Clock clock) {
        this.broker = Objects.requireNonNull(broker, "broker 는 필수입니다");
        this.ttl = Objects.requireNonNull(ttl, "ttl 은 필수입니다");
        this.clock = Objects.requireNonNull(clock, "clock 은 필수입니다");
    }

    @Override
    public FieldLockEntry acquireLock(
            UUID documentId,
            String fieldPath,
            String sessionId,
            String userId,
            String displayName) {
        Objects.requireNonNull(documentId, "documentId 는 필수입니다");
        String normalizedFieldPath = normalizeFieldPath(fieldPath);
        String normalizedSessionId = normalizeSessionId(sessionId);
        String normalizedUserId = normalizeUserId(userId);
        FieldLockEntry next = new FieldLockEntry(
                documentId,
                normalizedFieldPath,
                normalizedSessionId,
                normalizeDisplayName(displayName),
                PresenceColor.fromUserId(normalizedUserId),
                clock.instant());

        entries.compute(documentId, (ignored, documentEntries) -> {
            ConcurrentHashMap<String, CopyOnWriteArrayList<FieldLockEntry>> nextDocumentEntries =
                    documentEntries == null ? new ConcurrentHashMap<>() : documentEntries;
            CopyOnWriteArrayList<FieldLockEntry> fieldEntries =
                    nextDocumentEntries.computeIfAbsent(normalizedFieldPath, ignoredField -> new CopyOnWriteArrayList<>());
            fieldEntries.removeIf(entry -> entry.sessionId().equals(normalizedSessionId));
            fieldEntries.add(next);
            return nextDocumentEntries;
        });
        owners.computeIfAbsent(documentId, ignored -> new ConcurrentHashMap<>())
                .put(normalizedSessionId, normalizedUserId);
        broker.publish(documentId, FieldLockService.EVENT_ACQUIRED, next);
        return next;
    }

    @Override
    public void releaseLock(UUID documentId, String fieldPath, String sessionId, String userId) {
        Objects.requireNonNull(documentId, "documentId 는 필수입니다");
        String normalizedFieldPath = normalizeFieldPath(fieldPath);
        String normalizedSessionId = normalizeSessionId(sessionId);
        String normalizedUserId = normalizeUserId(userId);

        // 소유권 검증: 세션 등록자(userId)만 해제. 타 사용자가 listLocks 의 sessionId 로 임의 해제하는 것 차단(soft-lock → 불일치 시 조용히 no-op).
        ConcurrentHashMap<String, String> documentOwners = owners.get(documentId);
        String ownerUserId = documentOwners == null ? null : documentOwners.get(normalizedSessionId);
        if (ownerUserId != null && !ownerUserId.equals(normalizedUserId)) {
            return;
        }

        List<FieldLockEntry> removed = new ArrayList<>(1);
        entries.computeIfPresent(documentId, (ignored, documentEntries) -> {
            CopyOnWriteArrayList<FieldLockEntry> fieldEntries = documentEntries.get(normalizedFieldPath);
            if (fieldEntries == null) {
                return documentEntries;
            }
            for (FieldLockEntry entry : fieldEntries) {
                if (entry.sessionId().equals(normalizedSessionId) && fieldEntries.remove(entry)) {
                    removed.add(entry);
                }
            }
            if (fieldEntries.isEmpty()) {
                documentEntries.remove(normalizedFieldPath, fieldEntries);
            }
            return documentEntries.isEmpty() ? null : documentEntries;
        });

        for (FieldLockEntry entry : removed) {
            broker.publish(documentId, FieldLockService.EVENT_RELEASED, entry);
        }
    }

    @Override
    public List<FieldLockEntry> getLock(UUID documentId, String fieldPath) {
        Objects.requireNonNull(documentId, "documentId 는 필수입니다");
        String normalizedFieldPath = normalizeFieldPath(fieldPath);
        Map<String, CopyOnWriteArrayList<FieldLockEntry>> documentEntries = entries.get(documentId);
        if (documentEntries == null) {
            return List.of();
        }
        List<FieldLockEntry> fieldEntries = documentEntries.get(normalizedFieldPath);
        if (fieldEntries == null) {
            return List.of();
        }
        return fieldEntries.stream().sorted(FIELD_LOCK_ORDER).toList();
    }

    @Override
    public List<FieldLockEntry> listLocks(UUID documentId) {
        Objects.requireNonNull(documentId, "documentId 는 필수입니다");
        Map<String, CopyOnWriteArrayList<FieldLockEntry>> documentEntries = entries.get(documentId);
        if (documentEntries == null) {
            return List.of();
        }
        return documentEntries.values().stream()
                .flatMap(List::stream)
                .sorted(FIELD_LOCK_ORDER)
                .toList();
    }

    @Override
    public List<FieldLockEntry> pruneExpiredLocks() {
        Instant cutoff = clock.instant().minus(ttl);
        List<FieldLockEntry> removed = new ArrayList<>();
        for (Map.Entry<UUID, ConcurrentHashMap<String, CopyOnWriteArrayList<FieldLockEntry>>> document
                : entries.entrySet()) {
            UUID documentId = document.getKey();
            ConcurrentHashMap<String, CopyOnWriteArrayList<FieldLockEntry>> documentEntries = document.getValue();
            for (Map.Entry<String, CopyOnWriteArrayList<FieldLockEntry>> field : documentEntries.entrySet()) {
                CopyOnWriteArrayList<FieldLockEntry> fieldEntries = field.getValue();
                for (FieldLockEntry entry : fieldEntries) {
                    if (entry.lockedAt().isBefore(cutoff) && fieldEntries.remove(entry)) {
                        removed.add(entry);
                        broker.publish(documentId, FieldLockService.EVENT_RELEASED, entry);
                    }
                }
                if (fieldEntries.isEmpty()) {
                    documentEntries.remove(field.getKey(), fieldEntries);
                }
            }
            if (documentEntries.isEmpty()) {
                entries.remove(documentId, documentEntries);
            }
        }
        // prune 로 잠금이 모두 사라진 세션의 owner 매핑 정리.
        for (FieldLockEntry entry : removed) {
            forgetOwnerIfNoLocks(entry.documentId(), entry.sessionId());
        }
        return removed.stream().sorted(FIELD_LOCK_ORDER).toList();
    }

    @Scheduled(fixedRateString = "${samhan.realtime.field-lock.prune-ms:30000}")
    public void scheduledPruneExpiredLocks() {
        pruneExpiredLocks();
    }

    /** 세션이 문서에 더 이상 잠금을 갖지 않으면 owner 매핑을 제거한다(검증용 잔여 누수 방지). */
    private void forgetOwnerIfNoLocks(UUID documentId, String sessionId) {
        Map<String, CopyOnWriteArrayList<FieldLockEntry>> documentEntries = entries.get(documentId);
        boolean stillLocked = documentEntries != null
                && documentEntries.values().stream()
                        .flatMap(List::stream)
                        .anyMatch(entry -> entry.sessionId().equals(sessionId));
        if (stillLocked) {
            return;
        }
        ConcurrentHashMap<String, String> documentOwners = owners.get(documentId);
        if (documentOwners != null) {
            documentOwners.remove(sessionId);
            if (documentOwners.isEmpty()) {
                owners.remove(documentId, documentOwners);
            }
        }
    }

    private String normalizeUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId 는 필수입니다");
        }
        return userId.trim();
    }

    private String normalizeSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId 는 필수입니다");
        }
        return sessionId.trim();
    }

    private String normalizeFieldPath(String fieldPath) {
        if (fieldPath == null || fieldPath.isBlank()) {
            throw new IllegalArgumentException("fieldPath 는 필수입니다");
        }
        return fieldPath.trim();
    }

    private String normalizeDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return DEFAULT_DISPLAY_NAME;
        }
        String normalized = displayName.trim();
        if (UUID_SHAPE.matcher(normalized).matches()) {
            return DEFAULT_DISPLAY_NAME;
        }
        return normalized.length() <= MAX_DISPLAY_NAME_LENGTH
                ? normalized
                : normalized.substring(0, MAX_DISPLAY_NAME_LENGTH);
    }
}
