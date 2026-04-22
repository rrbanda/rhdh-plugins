/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { AgenticQuery, AgenticResult, ReasoningStep, AgenticStreamEvent } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import type { GraphSchema } from '@red-hat-developer-hub/backstage-plugin-skill-marketplace-common';
import { LlmClient, type LlmMessage, type LlmTool } from './LlmClient';
import { getToolRegistry, getToolByName, type ToolContext } from './tools';
import type { Neo4jService } from './Neo4jService';
import type { OciRegistryService } from './OciRegistryService';
import type { EmbeddingService } from './EmbeddingService';
import type { CypherQueryCatalog } from './CypherQueryCatalog';

export interface AgenticRagConfig {
  maxIterations: number;
  schemaCacheTtlSeconds: number;
}

const AGENTIC_DEFAULTS: AgenticRagConfig = {
  maxIterations: 5,
  schemaCacheTtlSeconds: 300,
};

export class AgenticRagService {
  private readonly llm: LlmClient;
  private readonly toolCtx: ToolContext;
  private readonly config: AgenticRagConfig;
  private readonly logger: LoggerService;
  private readonly neo4j: Neo4jService;
  private schemaCache: { schema: GraphSchema; expiresAt: number } | null = null;

  constructor(options: {
    llm: LlmClient;
    neo4j: Neo4jService;
    ociRegistry?: OciRegistryService;
    embedding?: EmbeddingService;
    logger: LoggerService;
    config?: Partial<AgenticRagConfig>;
    queryCatalog?: CypherQueryCatalog;
  }) {
    this.llm = options.llm;
    this.neo4j = options.neo4j;
    this.logger = options.logger;
    this.config = { ...AGENTIC_DEFAULTS, ...options.config };

    this.toolCtx = {
      neo4j: options.neo4j,
      ociRegistry: options.ociRegistry,
      embedding: options.embedding,
      logger: options.logger,
      queryCatalog: options.queryCatalog,
    };
  }

  private async getSchema(): Promise<GraphSchema> {
    if (this.schemaCache && Date.now() < this.schemaCache.expiresAt) {
      return this.schemaCache.schema;
    }
    const schema = await this.neo4j.discoverSchema();
    this.schemaCache = {
      schema,
      expiresAt: Date.now() + this.config.schemaCacheTtlSeconds * 1000,
    };
    return schema;
  }

  private buildSystemPrompt(schema: GraphSchema): string {
    const labels = schema.labels.map(l => `  - ${l.name} (${l.count} nodes)`).join('\n');
    const rels = schema.relationshipTypes.map(r => `  - ${r.type} (${r.count})`).join('\n');
    const domains = schema.pluginGroups.map(p => `  - ${p.name} (${p.count} skills)`).join('\n');

    return `You are a Skill Knowledge Graph assistant for an enterprise AI skill marketplace.
You have access to a Neo4j knowledge graph containing:
- ${schema.totalNodes} total nodes
- ${schema.totalRelationships} total relationships

Node labels:
${labels}

Relationship types:
${rels}

Domains/categories:
${domains}

Skills are AI agent capabilities stored as SKILL.md files in OCI registries. Each skill has:
- name, description, category, version, author, complexity
- Required and optional tools (e.g. "openai-chat", "document-intelligence")
- Relationships to other skills (DEPENDS_ON, SIMILAR_TO, RELATED_TO, etc.)
- Domain classification (security, engineering, devops, etc.)

When answering questions:
1. Think about what information you need before retrieving it
2. Use the most appropriate tool for each sub-question
3. If initial results are insufficient, try a different retrieval strategy
4. Cite specific skills by name in your answer
5. If you cannot find relevant information, say so rather than guessing
6. For impact analysis, trace relationships through the graph
7. Keep answers concise and well-structured`;
  }

  private getLlmTools(): LlmTool[] {
    return getToolRegistry().map(t => ({
      type: 'function' as const,
      function: t.definition,
    }));
  }

  async query(input: AgenticQuery): Promise<AgenticResult> {
    const startTime = Date.now();
    const maxIter = Math.min(input.maxIterations ?? this.config.maxIterations, 10);

    const schema = await this.getSchema();
    const systemPrompt = this.buildSystemPrompt(schema);
    const llmTools = this.getLlmTools();

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.query },
    ];

    if (input.context) {
      messages.push({ role: 'user', content: `Additional context: ${input.context}` });
    }

    const steps: ReasoningStep[] = [];
    const sources = new Set<string>();

    for (let i = 0; i < maxIter; i++) {
      const choice = await this.llm.chatCompletion(messages, llmTools);

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        messages.push(choice.message);

        const toolCallPromises = choice.message.tool_calls.map(async (call) => {
          const toolStart = Date.now();
          const tool = getToolByName(call.function.name);

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.function.arguments);
          } catch {
            this.logger.warn(`Failed to parse tool args for ${call.function.name}`);
          }

          let result: unknown;
          if (tool) {
            try {
              result = await tool.execute(parsedArgs, this.toolCtx);
              this.extractSources(result, sources);
            } catch (err) {
              result = { error: `Tool execution failed: ${(err as Error).message}` };
              this.logger.warn(`Tool ${call.function.name} failed: ${(err as Error).message}`);
            }
          } else {
            result = { error: `Unknown tool: ${call.function.name}` };
          }

          const step: ReasoningStep = {
            tool: call.function.name,
            input: parsedArgs,
            output: this.truncateOutput(result),
            durationMs: Date.now() - toolStart,
          };
          steps.push(step);

          return {
            role: 'tool' as const,
            content: JSON.stringify(this.truncateOutput(result)),
            tool_call_id: call.id,
          };
        });

        const toolMessages = await Promise.all(toolCallPromises);
        messages.push(...toolMessages);
      } else {
        return {
          answer: choice.message.content ?? 'No answer generated.',
          steps,
          iterations: i + 1,
          sources: Array.from(sources),
          durationMs: Date.now() - startTime,
        };
      }
    }

    const finalChoice = await this.llm.chatCompletion(messages, []);
    return {
      answer: finalChoice.message.content ?? 'Reached maximum iterations without a final answer.',
      steps,
      iterations: maxIter,
      sources: Array.from(sources),
      durationMs: Date.now() - startTime,
    };
  }

  async *queryStream(input: AgenticQuery): AsyncGenerator<AgenticStreamEvent> {
    const startTime = Date.now();
    const maxIter = Math.min(input.maxIterations ?? this.config.maxIterations, 10);

    const schema = await this.getSchema();
    const systemPrompt = this.buildSystemPrompt(schema);
    const llmTools = this.getLlmTools();

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.query },
    ];

    if (input.context) {
      messages.push({ role: 'user', content: `Additional context: ${input.context}` });
    }

    const steps: ReasoningStep[] = [];
    const sources = new Set<string>();

    for (let i = 0; i < maxIter; i++) {
      yield { type: 'thinking', data: { iteration: i + 1, maxIterations: maxIter } };

      const choice = await this.llm.chatCompletion(messages, llmTools);

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        messages.push(choice.message);

        for (const call of choice.message.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.function.arguments);
          } catch {
            /* will use empty args */
          }

          yield {
            type: 'tool_call',
            data: { tool: call.function.name, input: parsedArgs },
          };

          const toolStart = Date.now();
          const tool = getToolByName(call.function.name);
          let result: unknown;

          if (tool) {
            try {
              result = await tool.execute(parsedArgs, this.toolCtx);
              this.extractSources(result, sources);
            } catch (err) {
              result = { error: `Tool execution failed: ${(err as Error).message}` };
            }
          } else {
            result = { error: `Unknown tool: ${call.function.name}` };
          }

          const step: ReasoningStep = {
            tool: call.function.name,
            input: parsedArgs,
            output: this.truncateOutput(result),
            durationMs: Date.now() - toolStart,
          };
          steps.push(step);

          yield {
            type: 'tool_result',
            data: {
              tool: call.function.name,
              summary: this.summarizeToolResult(result),
              durationMs: step.durationMs,
            },
          };

          messages.push({
            role: 'tool',
            content: JSON.stringify(this.truncateOutput(result)),
            tool_call_id: call.id,
          });
        }
      } else {
        const answer = choice.message.content ?? 'No answer generated.';
        yield { type: 'answer', data: { answer } };
        yield {
          type: 'done',
          data: {
            steps,
            iterations: i + 1,
            sources: Array.from(sources),
            durationMs: Date.now() - startTime,
          },
        };
        return;
      }
    }

    const finalChoice = await this.llm.chatCompletion(messages, []);
    const answer = finalChoice.message.content ?? 'Reached maximum iterations.';
    yield { type: 'answer', data: { answer } };
    yield {
      type: 'done',
      data: {
        steps,
        iterations: maxIter,
        sources: Array.from(sources),
        durationMs: Date.now() - startTime,
      },
    };
  }

  private extractSources(result: unknown, sources: Set<string>): void {
    if (!result || typeof result !== 'object') return;
    const r = result as Record<string, unknown>;

    if (Array.isArray(r.results)) {
      for (const item of r.results) {
        if (item && typeof item === 'object' && 'name' in item) {
          sources.add(String((item as Record<string, unknown>).name));
        }
      }
    }
    if (Array.isArray(r.skills)) {
      for (const item of r.skills) {
        if (item && typeof item === 'object' && 'name' in item) {
          sources.add(String((item as Record<string, unknown>).name));
        }
      }
    }
    if (r.metadata && typeof r.metadata === 'object' && 'name' in (r.metadata as Record<string, unknown>)) {
      sources.add(String((r.metadata as Record<string, unknown>).name));
    }
    if (r.center && typeof r.center === 'object' && 'name' in (r.center as Record<string, unknown>)) {
      sources.add(String((r.center as Record<string, unknown>).name));
    }
    if (Array.isArray(r.neighbors)) {
      for (const n of r.neighbors) {
        if (n && typeof n === 'object' && 'name' in n) {
          sources.add(String((n as Record<string, unknown>).name));
        }
      }
    }
  }

  private truncateOutput(result: unknown): unknown {
    const json = JSON.stringify(result);
    if (json.length <= 4000) return result;

    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (Array.isArray(r.results) && r.results.length > 5) {
        return { ...r, results: r.results.slice(0, 5), _truncated: true };
      }
      if (Array.isArray(r.skills) && r.skills.length > 5) {
        return { ...r, skills: r.skills.slice(0, 5), _truncated: true };
      }
    }

    return { _truncated: true, summary: json.slice(0, 3900) + ' [truncated]' };
  }

  private summarizeToolResult(result: unknown): string {
    if (!result || typeof result !== 'object') return 'No data';
    const r = result as Record<string, unknown>;

    if (r.error) return `Error: ${String(r.error).slice(0, 100)}`;
    if (Array.isArray(r.results)) return `Found ${r.results.length} results`;
    if (Array.isArray(r.skills)) return `Found ${r.skills.length} skills`;
    if (r.metadata) return `Got details for ${(r.metadata as Record<string, unknown>).name}`;
    if (r.center) return `Explored neighborhood of ${(r.center as Record<string, unknown>).name}`;
    if (r.labels) return `Schema: ${(r.labels as unknown[]).length} labels, ${(r.relationshipTypes as unknown[]).length} rel types`;

    return 'Completed';
  }
}
