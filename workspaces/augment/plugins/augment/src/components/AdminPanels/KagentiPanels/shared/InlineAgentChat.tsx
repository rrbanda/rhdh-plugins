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

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useTheme, alpha } from '@mui/material/styles';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';

export interface InlineAgentChatProps {
  agentId: string;
  agentName: string;
}

export function InlineAgentChat({ agentId, agentName }: InlineAgentChatProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const configApi = useApi(configApiRef);
  const { fetch: authFetch } = useApi(fetchApiRef);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'agent'; text: string }>
  >([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setSending(true);
    try {
      const backendUrl = configApi.getString('backend.baseUrl');
      const resp = await authFetch(`${backendUrl}/api/augment/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMsg }],
          model: agentId,
          sessionId,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
        throw new Error(errText || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const content =
        data?.choices?.[0]?.message?.content ||
        data?.content ||
        data?.message ||
        JSON.stringify(data);
      setChatMessages(prev => [...prev, { role: 'agent', text: content }]);
      if (data?.sessionId) setSessionId(data.sessionId);
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: `Error: ${err instanceof Error ? err.message : 'Failed to reach agent'}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [agentId, input, sending, sessionId, configApi, authFetch]);

  return (
    <Box
      sx={{
        height: 420,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.4)
          : theme.palette.background.paper,
      }}
    >
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {chatMessages.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="body2" color="text.disabled">
              Send a message to test {agentName}
            </Typography>
          </Box>
        )}
        {chatMessages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor:
                msg.role === 'user'
                  ? alpha(theme.palette.primary.main, isDark ? 0.2 : 0.1)
                  : alpha(theme.palette.background.default, isDark ? 0.6 : 0.8),
              border:
                msg.role === 'agent'
                  ? `1px solid ${alpha(theme.palette.divider, 0.3)}`
                  : undefined,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontSize: '0.85rem',
                color: 'text.primary',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.text}
            </Typography>
          </Box>
        ))}
        {sending && (
          <Box sx={{ alignSelf: 'flex-start', px: 2, py: 1 }}>
            <Typography
              variant="body2"
              color="text.disabled"
              sx={{ fontStyle: 'italic' }}
            >
              {agentName} is thinking...
            </Typography>
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          p: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Message ${agentName}...`}
          disabled={sending}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: theme.palette.text.primary,
            fontSize: '0.875rem',
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: alpha(
              theme.palette.background.default,
              isDark ? 0.5 : 0.8,
            ),
          }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            minWidth: 60,
            boxShadow: 'none',
          }}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
}
