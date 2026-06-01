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

/**
 * Shared HTTP route path constants for the Augment plugin.
 *
 * Both the backend route handlers and the frontend API client
 * import from here to avoid path duplication and drift.
 *
 * @public
 */
export const CHAT_ROUTES = {
  /** POST - SSE streaming chat */
  STREAM: '/chat/stream',
  /** POST - Non-streaming chat */
  CHAT: '/chat',
  /** POST - HITL tool approval / interactive phase continuation */
  APPROVE: '/chat/approve',
} as const;

/** @public */
export const SESSION_ROUTES = {
  /** GET (list) / POST (create) */
  ROOT: '/sessions',
  /** GET / DELETE / PATCH by session ID */
  BY_ID: '/sessions/:sessionId',
  /** GET - Session messages */
  MESSAGES: '/sessions/:sessionId/messages',
  /** GET - Session debug state */
  STATE: '/sessions/:sessionId/state',
  /** POST - Message feedback (thumbs up/down) */
  FEEDBACK: '/feedback',
} as const;

/** @public */
export const CONVERSATION_ROUTES = {
  /** POST - Create a new LlamaStack conversation container */
  CREATE: '/conversations/create',
  /** GET - List conversations */
  LIST: '/conversations',
  /** GET / DELETE by response ID */
  BY_RESPONSE_ID: '/conversations/:responseId',
} as const;

/** @public */
export const ADMIN_ROUTES = {
  /** GET - List all users' sessions (admin only) */
  SESSIONS: '/admin/sessions',
  /** GET - Get any session's messages (admin only) */
  SESSION_MESSAGES: '/admin/sessions/:sessionId/messages',
} as const;

/**
 * All paths that require authentication (used by plugin.ts auth policies).
 * @public
 */
export const PROTECTED_PATHS: readonly string[] = [
  CHAT_ROUTES.STREAM,
  CHAT_ROUTES.CHAT,
  CHAT_ROUTES.APPROVE,
  SESSION_ROUTES.ROOT,
  SESSION_ROUTES.FEEDBACK,
  CONVERSATION_ROUTES.LIST,
  CONVERSATION_ROUTES.CREATE,
  ADMIN_ROUTES.SESSIONS,
] as const;
