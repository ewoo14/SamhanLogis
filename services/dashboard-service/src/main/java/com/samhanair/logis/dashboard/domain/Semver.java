package com.samhanair.logis.dashboard.domain;

import java.util.ArrayList;
import java.util.List;

/** 앱 버전 정책용 semver 비교 유틸리티. */
public final class Semver {

    private Semver() {
    }

    /**
     * semver 문자열을 비교한다.
     *
     * <p>{@code v} prefix, build metadata 는 허용한다. prerelease 는 release 보다 낮게 본다.
     */
    public static int compare(String left, String right) {
        Parsed l = parse(left, "left");
        Parsed r = parse(right, "right");
        for (int i = 0; i < 3; i++) {
            int compared = Integer.compare(l.numbers().get(i), r.numbers().get(i));
            if (compared != 0) {
                return compared;
            }
        }
        if (l.prerelease().isEmpty() && r.prerelease().isEmpty()) {
            return 0;
        }
        if (l.prerelease().isEmpty()) {
            return 1;
        }
        if (r.prerelease().isEmpty()) {
            return -1;
        }
        return l.prerelease().compareTo(r.prerelease());
    }

    /** semver 형식을 검증한다. */
    public static void requireValid(String value, String fieldName) {
        parse(value, fieldName);
    }

    private static Parsed parse(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(fieldName + " semver 필수");
        }
        String value = raw.trim();
        if (value.startsWith("v") || value.startsWith("V")) {
            value = value.substring(1);
        }
        int buildIndex = value.indexOf('+');
        if (buildIndex >= 0) {
            value = value.substring(0, buildIndex);
        }
        String prerelease = "";
        int prereleaseIndex = value.indexOf('-');
        if (prereleaseIndex >= 0) {
            prerelease = value.substring(prereleaseIndex + 1);
            value = value.substring(0, prereleaseIndex);
        }
        String[] parts = value.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException(fieldName + " semver 형식 불일치: " + raw);
        }
        List<Integer> numbers = new ArrayList<>(3);
        for (String part : parts) {
            if (!part.matches("0|[1-9][0-9]*")) {
                throw new IllegalArgumentException(fieldName + " semver 형식 불일치: " + raw);
            }
            numbers.add(Integer.parseInt(part));
        }
        if (!prerelease.isEmpty() && !prerelease.matches("[0-9A-Za-z.-]+")) {
            throw new IllegalArgumentException(fieldName + " semver 형식 불일치: " + raw);
        }
        return new Parsed(numbers, prerelease);
    }

    private record Parsed(List<Integer> numbers, String prerelease) {
    }
}
