package com.samhanair.logis.slip.security;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/** actorName 이 해당 행의 actorId UUID를 표현하는지 판정하는 공통 경계 helper. */
public final class ActorNameSanitizer {

    private static final Pattern UUID_FORM = Pattern.compile(
            "^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                    + "|\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\}"
                    + "|(?i:urn:uuid:)[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                    + "|[0-9a-fA-F]{32})$");

    private ActorNameSanitizer() {
    }

    /**
     * actorName 이 actorId 와 같은 UUID를 canonical/중괄호/URN/32자 hex 형식으로 표현하면 true.
     * UUID 모양만으로는 true 를 반환하지 않는다.
     */
    public static boolean representsActorId(String actorName, UUID actorId) {
        if (actorName == null || actorName.isBlank() || actorId == null) {
            return false;
        }
        String normalizedName = normalizeUuid(actorName);
        return normalizedName != null
                && normalizedName.equals(actorId.toString().toLowerCase(Locale.ROOT));
    }

    private static String normalizeUuid(String value) {
        String trimmed = value.trim();
        if (!UUID_FORM.matcher(trimmed).matches()) {
            return null;
        }
        String candidate = trimmed;
        if (candidate.startsWith("{") && candidate.endsWith("}")) {
            candidate = candidate.substring(1, candidate.length() - 1);
        } else if (candidate.regionMatches(true, 0, "urn:uuid:", 0, 9)) {
            candidate = candidate.substring(9);
        } else if (candidate.length() == 32) {
            candidate = candidate.substring(0, 8) + "-"
                    + candidate.substring(8, 12) + "-"
                    + candidate.substring(12, 16) + "-"
                    + candidate.substring(16, 20) + "-"
                    + candidate.substring(20);
        }
        try {
            return UUID.fromString(candidate).toString().toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
