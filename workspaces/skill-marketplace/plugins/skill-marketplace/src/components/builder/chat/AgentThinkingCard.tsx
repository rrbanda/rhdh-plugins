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
import { formatAgentName } from './AgentActivityFeed';

const thinkingStyles = `
.bld-thinking {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  margin: 8px 16px;
  border-radius: 12px;
  background: var(--pf-t--global--background--color--secondary--default, #f8f8f8);
  animation: bld-thinking-fade 0.3s ease;
}
@keyframes bld-thinking-fade { from { opacity: 0; transform: translateY(4px); } }

.bld-thinking-pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pf-t--global--color--brand--default, #0066cc);
  animation: bld-thinking-dot 1.4s ease-in-out infinite;
}
@keyframes bld-thinking-dot {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; }
}

.bld-thinking-text {
  font-size: 13px;
  color: var(--pf-t--global--text--color--subtle, #6a6e73);
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.bld-thinking-dots {
  display: inline-flex;
  gap: 3px;
  margin-left: 2px;
}
.bld-thinking-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--pf-t--global--text--color--subtle, #6a6e73);
  animation: bld-dot-bounce 1.4s ease-in-out infinite;
}
.bld-thinking-dots span:nth-child(2) { animation-delay: 0.16s; }
.bld-thinking-dots span:nth-child(3) { animation-delay: 0.32s; }
@keyframes bld-dot-bounce {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
`;

function agentLabel(agentName: string): string {
  return formatAgentName(agentName) || agentName;
}

interface AgentThinkingCardProps {
  agentName: string;
}

export function AgentThinkingCard({ agentName }: AgentThinkingCardProps) {
  return (
    <>
      <style>{thinkingStyles}</style>
      <div className="bld-thinking" role="status" aria-label="Agent is working">
        <span className="bld-thinking-pulse" />
        <span className="bld-thinking-text">
          {agentName ? agentLabel(agentName) : 'Connecting to agent'}
          <span className="bld-thinking-dots">
            <span />
            <span />
            <span />
          </span>
        </span>
      </div>
    </>
  );
}
