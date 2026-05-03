package com.shuaibo.ai.service.rag;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * RAG服务 - 预留接口，当前返回空结果
 * 后续可接入向量数据库（Qdrant/Milvus）或简单文本匹配
 */
@Slf4j
@Service
public class RagService {

    /**
     * 检索相关代码片段（暂未实现）
     */
    public List<String> search(String question, int topK) {
        log.debug("RAG search (disabled): question={}, topK={}", question, topK);
        return List.of();
    }

    /**
     * 将检索结果组装为 Prompt 上下文
     */
    public String buildContext(List<String> codeSnippets) {
        if (codeSnippets == null || codeSnippets.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("以下是相关的代码片段，请基于这些代码回答问题：\n\n");
        for (int i = 0; i < codeSnippets.size(); i++) {
            sb.append("--- 代码片段 ").append(i + 1).append(" ---\n");
            sb.append(codeSnippets.get(i)).append("\n\n");
        }
        return sb.toString();
    }
}
