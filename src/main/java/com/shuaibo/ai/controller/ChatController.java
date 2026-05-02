package com.shuaibo.ai.controller;

import com.shuaibo.ai.model.ChatRequest;
import com.shuaibo.ai.model.ChatResponse;
import com.shuaibo.ai.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * AI对话接口
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    /**
     * AI对话
     */
    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        return chatService.chat(request);
    }

    /**
     * 清除会话历史
     */
    @DeleteMapping("/chat/{sessionId}")
    public String clearHistory(@PathVariable String sessionId) {
        chatService.clearHistory(sessionId);
        return "ok";
    }

    /**
     * 健康检查
     */
    @GetMapping("/health")
    public String health() {
        return "CodeLens AI is running";
    }
}
