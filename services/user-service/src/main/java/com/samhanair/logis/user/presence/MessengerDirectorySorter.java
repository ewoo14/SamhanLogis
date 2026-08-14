package com.samhanair.logis.user.presence;

import java.util.Comparator;
import java.util.List;

/** 그룹 우선순위 → 알려진 직급 → 입사일 정렬. 그룹 순서는 호출자가 전달한 순서를 보존한다. */
public final class MessengerDirectorySorter {
    private static final List<String> JOB_RANK = List.of("대표", "사장", "이사", "부장", "차장", "과장", "대리", "사원");

    private MessengerDirectorySorter() {}

    public static List<MessengerDirectoryEntry> sort(List<MessengerDirectoryEntry> entries) {
        var groupOrder = new java.util.LinkedHashMap<String, Integer>();
        entries.forEach(e -> groupOrder.putIfAbsent(e.groupName(), groupOrder.size()));
        return entries.stream().sorted(Comparator
                .comparingInt((MessengerDirectoryEntry e) -> groupOrder.get(e.groupName()))
                .thenComparingInt(e -> JOB_RANK.indexOf(e.jobTitle()) < 0 ? 100 : JOB_RANK.indexOf(e.jobTitle()))
                .thenComparing(MessengerDirectoryEntry::hireDate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(MessengerDirectoryEntry::jobTitle)
                .thenComparing(e -> e.employeeCode() == null ? "" : e.employeeCode()))
                .toList();
    }
}
