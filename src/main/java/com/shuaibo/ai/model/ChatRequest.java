package com.shuaibo.ai.model;

import lombok.Data;

/**
 * 聊天请求
 */
@Data
public class ChatRequest {
    /** 用户提问 */
    private String question;
    /** 会话ID（多轮对话） */
    private String sessionId;
}
