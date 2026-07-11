package com.samhanair.logis.shared.realtime.lock;

import java.util.Collections;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

/**
 * 도메인 status 별 잠금 정책 — PR-H4a (Phase 12 Step 4a) 통합 abstraction.
 *
 * <p>각 도메인 (slip / lot / dispatch / partner-order 등) 의 라이프사이클 status enum 을 본
 * policy 의 set 에 넣어 일관 분기. 14 service 동일 패턴.
 *
 * <p><b>정책 카테고리</b>:
 * <ul>
 *   <li>{@link #freeStatuses} — 작성자 자유 mutation (DRAFT/SAVED/SENT 등)</li>
 *   <li>{@link #lockedRequiresApproval} — APPROVED 요청 1건 소진 후 mutation 가능
 *       (CONFIRMED/ACCEPTED/PROCESSING 등)</li>
 *   <li>{@link #fullyLocked} — 어떤 채널로도 mutation 불가 (INSPECTING/SHIPPING/DELIVERED 등)</li>
 *   <li>{@link #terminalStatuses} — 종결됨 (REJECTED/CANCELED 등) — mutation 의미 없음</li>
 * </ul>
 *
 * <p>{@link EditLockGuard} 가 본 policy 를 받아 canEdit/canDelete 분기.
 *
 * <p><b>Generic 파라미터</b> {@code T} = 각 도메인의 status enum (SlipStatus / DispatchStatus 등).
 * Set 비교가 정확하도록 enum 권장.
 */
public final class EditLockPolicy<T> {

    private final Set<T> freeStatuses;
    private final Set<T> lockedRequiresApproval;
    private final Set<T> fullyLocked;
    private final Set<T> terminalStatuses;
    private final Function<T, String> displayNameFn;

    private EditLockPolicy(Set<T> freeStatuses, Set<T> lockedRequiresApproval,
                           Set<T> fullyLocked, Set<T> terminalStatuses,
                           Function<T, String> displayNameFn) {
        this.freeStatuses = Collections.unmodifiableSet(freeStatuses);
        this.lockedRequiresApproval = Collections.unmodifiableSet(lockedRequiresApproval);
        this.fullyLocked = Collections.unmodifiableSet(fullyLocked);
        this.terminalStatuses = Collections.unmodifiableSet(terminalStatuses);
        this.displayNameFn = displayNameFn;
    }

    public Set<T> freeStatuses() { return freeStatuses; }
    public Set<T> lockedRequiresApproval() { return lockedRequiresApproval; }
    public Set<T> fullyLocked() { return fullyLocked; }
    public Set<T> terminalStatuses() { return terminalStatuses; }

    /** 사용자 노출용 상태 라벨 — 미지정 정책은 기존 raw 문자열 fallback. */
    public String displayName(T status) {
        return displayNameFn != null ? displayNameFn.apply(status) : String.valueOf(status);
    }

    /** 자유 단계 — 작성자 직접 mutation 허용. */
    public boolean isFree(T status) {
        return freeStatuses.contains(status);
    }

    /** 잠금 단계 — APPROVED 요청 1건 소진 후 mutation 가능. */
    public boolean isLockedRequiresApproval(T status) {
        return lockedRequiresApproval.contains(status);
    }

    /** 완전 잠금 단계 — 어떤 채널로도 mutation 불가. */
    public boolean isFullyLocked(T status) {
        return fullyLocked.contains(status);
    }

    /** 종결 단계 — REJECTED/CANCELED 등, mutation 의미 없음. */
    public boolean isTerminal(T status) {
        return terminalStatuses.contains(status);
    }

    /** 신규 builder. */
    public static <T> Builder<T> builder() {
        return new Builder<>();
    }

    /** {@link EditLockPolicy} builder. set 누락 시 빈 set 으로 처리. */
    public static final class Builder<T> {
        private final Set<T> free = new HashSet<>();
        private final Set<T> locked = new HashSet<>();
        private final Set<T> fully = new HashSet<>();
        private final Set<T> terminal = new HashSet<>();
        private Function<T, String> displayNameFn;

        @SafeVarargs
        public final Builder<T> freeStatuses(T... statuses) {
            Objects.requireNonNull(statuses);
            for (T s : statuses) free.add(s);
            return this;
        }

        @SafeVarargs
        public final Builder<T> lockedRequiresApproval(T... statuses) {
            Objects.requireNonNull(statuses);
            for (T s : statuses) locked.add(s);
            return this;
        }

        @SafeVarargs
        public final Builder<T> fullyLocked(T... statuses) {
            Objects.requireNonNull(statuses);
            for (T s : statuses) fully.add(s);
            return this;
        }

        @SafeVarargs
        public final Builder<T> terminalStatuses(T... statuses) {
            Objects.requireNonNull(statuses);
            for (T s : statuses) terminal.add(s);
            return this;
        }

        public Builder<T> displayName(Function<T, String> fn) {
            this.displayNameFn = fn;
            return this;
        }

        public EditLockPolicy<T> build() {
            return new EditLockPolicy<>(free, locked, fully, terminal, displayNameFn);
        }
    }
}
