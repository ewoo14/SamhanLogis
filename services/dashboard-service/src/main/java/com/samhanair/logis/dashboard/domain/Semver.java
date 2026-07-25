package com.samhanair.logis.dashboard.domain;

import java.math.BigInteger;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 개발 버전과 마이그레이션 전 semver를 함께 비교하는 앱 버전 유틸리티. */
public final class Semver {

    private static final Pattern DEVELOPMENT_VERSION_PATTERN =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})-([1-9][0-9]*)$");

    private Semver() {
    }

    /**
     * 개발 버전은 날짜와 일련번호로, 구버전 semver는 기존 규칙으로 비교한다.
     *
     * <p>{@code v} prefix, build metadata 는 허용한다. prerelease 는 release 보다 낮게 본다.
     */
    public static int compare(String left, String right) {
        boolean leftDevelopment = looksLikeDevelopmentVersion(left);
        boolean rightDevelopment = looksLikeDevelopmentVersion(right);
        if (leftDevelopment || rightDevelopment) {
            if (leftDevelopment && rightDevelopment) {
                return compareDevelopmentVersion(
                        parseDevelopmentVersion(left, "left"),
                        parseDevelopmentVersion(right, "right"));
            }
            if (leftDevelopment) {
                parse(right, "right");
                return 1;
            }
            parse(left, "left");
            return -1;
        }

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
        return comparePrerelease(l.prerelease(), r.prerelease());
    }

    /** 신규 형식과 마이그레이션 전 semver 형식을 모두 검증한다. */
    public static void requireValid(String value, String fieldName) {
        if (looksLikeDevelopmentVersion(value)) {
            parseDevelopmentVersion(value, fieldName);
            return;
        }
        parse(value, fieldName);
    }

    /** 신규 릴리스 등록에 사용하는 개발 버전 형식을 검증한다. */
    public static void requireDevelopmentVersion(String value, String fieldName) {
        parseDevelopmentVersion(value, fieldName);
    }

    /** 값이 유효한 개발 버전 형식인지 반환한다. */
    public static boolean isDevelopmentVersion(String value) {
        if (!looksLikeDevelopmentVersion(value)) {
            return false;
        }
        parseDevelopmentVersion(value, "version");
        return true;
    }

    private static boolean looksLikeDevelopmentVersion(String raw) {
        return raw != null && DEVELOPMENT_VERSION_PATTERN.matcher(raw.trim()).matches();
    }

    private static DevelopmentParsed parseDevelopmentVersion(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            throw developmentFormatException(fieldName);
        }
        String value = raw.trim();
        Matcher matcher = DEVELOPMENT_VERSION_PATTERN.matcher(value);
        if (!matcher.matches()) {
            throw developmentFormatException(fieldName);
        }
        try {
            LocalDate date = LocalDate.of(
                    Integer.parseInt(matcher.group(1)),
                    Integer.parseInt(matcher.group(2)),
                    Integer.parseInt(matcher.group(3)));
            return new DevelopmentParsed(date, new BigInteger(matcher.group(4)));
        } catch (DateTimeException | NumberFormatException ex) {
            throw developmentFormatException(fieldName);
        }
    }

    private static int compareDevelopmentVersion(DevelopmentParsed left, DevelopmentParsed right) {
        int dateComparison = left.date().compareTo(right.date());
        return dateComparison != 0 ? dateComparison : left.sequence().compareTo(right.sequence());
    }

    private static IllegalArgumentException developmentFormatException(String fieldName) {
        return new IllegalArgumentException(
                fieldName + "은 YYYY/MM/DD-{번호} 형식이어야 합니다. 예: 2026/07/25-1");
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

    private static int comparePrerelease(String left, String right) {
        String[] leftParts = left.split("\\.", -1);
        String[] rightParts = right.split("\\.", -1);
        int sharedLength = Math.min(leftParts.length, rightParts.length);
        for (int i = 0; i < sharedLength; i++) {
            int compared = comparePrereleaseIdentifier(leftParts[i], rightParts[i]);
            if (compared != 0) {
                return compared;
            }
        }
        return Integer.compare(leftParts.length, rightParts.length);
    }

    private static int comparePrereleaseIdentifier(String left, String right) {
        boolean leftNumeric = isNumericIdentifier(left);
        boolean rightNumeric = isNumericIdentifier(right);
        if (leftNumeric && rightNumeric) {
            return new BigInteger(left).compareTo(new BigInteger(right));
        }
        if (leftNumeric) {
            return -1;
        }
        if (rightNumeric) {
            return 1;
        }
        return left.compareTo(right);
    }

    private static boolean isNumericIdentifier(String value) {
        return value.matches("[0-9]+");
    }

    private record Parsed(List<Integer> numbers, String prerelease) {
    }

    private record DevelopmentParsed(LocalDate date, BigInteger sequence) {
    }
}
