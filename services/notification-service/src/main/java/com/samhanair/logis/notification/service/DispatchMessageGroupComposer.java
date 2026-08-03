package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.dto.DispatchMessageGroupInput;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/** 레거시 배차안내문자의 단톡방/인수자번호 및 하차일별 그룹 문구 생성기. */
@Component
public class DispatchMessageGroupComposer {

    private static final String HEADER = "AI 삼성무풍 시스템에어컨 배차실입니다.";
    private static final String UNMAPPED_NOTICE =
            "※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.";

    /**
     * 입력 전표를 1차 그룹 키로 묶은 뒤 하차일 section을 숫자 오름차순으로 조립한다.
     *
     * @param inputs 전표 단위 표시 입력
     * @return entryKey별 그룹 문구
     */
    public Map<String, String> compose(List<DispatchMessageGroupInput> inputs) {
        Map<String, String> result = new LinkedHashMap<>();
        Map<String, List<DispatchMessageGroupInput>> groups = new LinkedHashMap<>();
        if (inputs == null) {
            return result;
        }

        for (DispatchMessageGroupInput input : inputs) {
            if (input == null || input.entryKey() == null || input.entryKey().isBlank()) {
                continue;
            }
            if (hasText(input.fallbackMessage())) {
                result.put(input.entryKey(), input.fallbackMessage().trim());
                continue;
            }
            groups.computeIfAbsent(groupKey(input), ignored -> new ArrayList<>()).add(input);
        }

        for (List<DispatchMessageGroupInput> group : groups.values()) {
            String message = renderGroup(group);
            for (DispatchMessageGroupInput input : group) {
                result.put(input.entryKey(), message);
            }
        }
        return result;
    }

    private String renderGroup(List<DispatchMessageGroupInput> group) {
        Map<Integer, List<String>> linesByDay = new TreeMap<>();
        for (DispatchMessageGroupInput input : group) {
            int day = input.unloadDay() == null ? 0 : input.unloadDay();
            linesByDay.computeIfAbsent(day, ignored -> new ArrayList<>())
                    .add(safe(input.displayLine()));
        }

        List<String> sections = new ArrayList<>();
        for (Map.Entry<Integer, List<String>> entry : linesByDay.entrySet()) {
            String section = entry.getKey() + "일 하차 건 배송기사님 연락처를 안내드립니다.";
            List<String> lines = entry.getValue().stream()
                    .filter(DispatchMessageGroupComposer::hasText)
                    .toList();
            if (!lines.isEmpty()) {
                section += "\n" + String.join("\n", lines);
            }
            sections.add(section);
        }

        String message = HEADER + "\n\n" + String.join("\n\n", sections);
        if (!hasText(group.get(0).chatRoomName())) {
            message += "\n\n" + UNMAPPED_NOTICE;
        }
        return message;
    }

    private String groupKey(DispatchMessageGroupInput input) {
        if (hasText(input.chatRoomName())) {
            return "R_" + input.chatRoomName().trim();
        }
        if (hasText(input.recipientPhone())) {
            return "P_" + input.recipientPhone().trim();
        }
        return "N_" + input.entryKey();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
