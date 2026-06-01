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
 * Shared validation constants for the Augment plugin.
 *
 * Both the backend parsers and the frontend API client use these
 * limits to ensure consistent validation without duplicating values.
 *
 * @public
 */
export const VALIDATION_LIMITS = {
  /** Maximum number of messages in a single chat request */
  MAX_MESSAGES_PER_REQUEST: 200,
  /** Maximum character length of a single message content field */
  MAX_MESSAGE_CONTENT_LENGTH: 100_000,
  /** Maximum length for approval-related fields (responseId, callId, reason) */
  MAX_APPROVAL_FIELD_LENGTH: 1_000,
  /** Maximum length for the model identifier string */
  MAX_MODEL_LENGTH: 200,
  /** Maximum length for session ID */
  MAX_SESSION_ID_LENGTH: 128,
  /** Maximum number of sessions returned in a list */
  MAX_SESSION_LIST_LIMIT: 500,
  /** Maximum length for session title */
  MAX_SESSION_TITLE_LENGTH: 200,
} as const;

/** Valid message roles in a chat request. @public */
export const VALID_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof VALID_MESSAGE_ROLES)[number];

/** Regex pattern for valid session IDs. @public */
export const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates a session ID format.
 * Returns an error message if invalid, or undefined if valid.
 * @public
 */
export function validateSessionId(
  sessionId: string | undefined,
): string | undefined {
  if (sessionId === undefined) return undefined;
  if (typeof sessionId !== 'string') return 'sessionId must be a string';
  if (sessionId.length > VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH) {
    return `sessionId must be 1-${VALIDATION_LIMITS.MAX_SESSION_ID_LENGTH} characters`;
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return 'sessionId must be alphanumeric with hyphens/underscores only';
  }
  return undefined;
}

/**
 * Validates message content length.
 * Returns an error message if invalid, or undefined if valid.
 * @public
 */
export function validateMessageContent(content: string): string | undefined {
  if (content.length > VALIDATION_LIMITS.MAX_MESSAGE_CONTENT_LENGTH) {
    return `Message exceeds maximum of ${VALIDATION_LIMITS.MAX_MESSAGE_CONTENT_LENGTH.toLocaleString()} characters`;
  }
  return undefined;
}
