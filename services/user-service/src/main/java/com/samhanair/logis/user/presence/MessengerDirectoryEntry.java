package com.samhanair.logis.user.presence;

import java.time.LocalDate;

/** 메신저 directory 정렬에 필요한 공개 식별자만 담는 값 객체(UUID 비공개). */
public record MessengerDirectoryEntry(String groupName, String jobTitle, LocalDate hireDate, String employeeCode) {}
