package com.shuaibo.ai.service.rag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * RAG服务 - 向量检索 + 上下文组装
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RagService {

    private final EmbeddingModel embeddingModel;

    /**
     * 将文本向量化
     */
    public float[] embed(String text) {
        List<float[]> embeddings = embeddingModel.embed(List.of(text));
        return embeddings.get(0);
    }

    /**
     * 检索相关代码片段（后续接入Qdrant）
     * 当前返回空，待Qdrant接入后实现
     */
    public List<String> search(String question, int topK) {
        // TODO: 接入Qdrant向量检索
        log.debug("RAG search: question={}, topK={}", question, topK);
        return List.of();
    }

    /**
     * 将检索结果组装为Prompt上下文
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
