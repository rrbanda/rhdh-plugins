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

import { useCallback, useRef } from 'react';
import type { AugmentApi } from '../api/AugmentApi';
import type { Message } from '../types';
import type { StreamingState } from '../components/StreamingMessage/StreamingMessage.types';
import { debugError } from '../utils';

interface UseInteractivePhasesOptions {
  api: AugmentApi;
  streamingState: StreamingState | null;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  setStreamingState: (state: StreamingState | null) => void;
  setIsTyping: (typing: boolean) => void;
  setLastCompletedState?: (state: StreamingState | null) => void;
}

interface ApprovalCallParams {
  contextId: string;
  taskId: string;
  approved: boolean;
  responseType?: string;
  payload?: string;
  successFallback: string;
  errorLabel: string;
  errorCode: string;
}

export function useInteractivePhases({
  api,
  streamingState,
  messages,
  onMessagesChange,
  setStreamingState,
  setIsTyping,
  setLastCompletedState,
}: UseInteractivePhasesOptions) {
  const msgCounter = useRef(0);

  const submitApproval = useCallback(
    async (params: ApprovalCallParams) => {
      try {
        const result = await api.submitToolApproval(
          params.contextId,
          params.taskId,
          params.approved,
          params.responseType,
          params.payload,
        );
        const text = result?.content || params.successFallback;
        const botMsg: Message = {
          id: `msg-approval-${msgCounter.current++}`,
          text,
          isUser: false,
          timestamp: new Date(),
          responseId: result?.responseId,
        };
        onMessagesChange([...messages, botMsg]);
      } catch (err) {
        debugError(`${params.errorLabel} failed:`, err);
        const errorMsg: Message = {
          id: `msg-error-${msgCounter.current++}`,
          text: `${params.errorLabel} failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
          isUser: false,
          timestamp: new Date(),
          errorCode: params.errorCode,
        };
        onMessagesChange([...messages, errorMsg]);
      } finally {
        setLastCompletedState?.(streamingState);
        setStreamingState(null);
        setIsTyping(false);
      }
    },
    [
      api,
      streamingState,
      setStreamingState,
      setIsTyping,
      setLastCompletedState,
      messages,
      onMessagesChange,
    ],
  );

  const handleFormSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      const pending = streamingState?.pendingForm;
      if (!pending) return;
      await submitApproval({
        contextId: pending.contextId || streamingState?.responseId || '',
        taskId: pending.taskId || '',
        approved: true,
        responseType: 'form_response',
        payload: JSON.stringify(values),
        successFallback: 'Request processed successfully.',
        errorLabel: 'Form submission',
        errorCode: 'form_submission_error',
      });
    },
    [streamingState, submitApproval],
  );

  const handleFormCancel = useCallback(async () => {
    const pending = streamingState?.pendingForm;
    if (!pending) return;
    setLastCompletedState?.(streamingState);
    setStreamingState(null);
    setIsTyping(false);
    try {
      await api.submitToolApproval(
        pending.contextId || streamingState?.responseId || '',
        pending.taskId || '',
        false,
      );
    } catch (err) {
      debugError('Form cancellation failed:', err);
      const errMsg =
        err instanceof Error ? err.message : 'Form cancellation failed';
      onMessagesChange([
        ...messages,
        {
          id: `form-cancel-err-${Date.now()}`,
          text: `Error: ${errMsg}`,
          isUser: false,
          timestamp: new Date(),
          errorCode: 'form_cancel_error',
        },
      ]);
    }
  }, [
    api,
    streamingState,
    setStreamingState,
    setIsTyping,
    setLastCompletedState,
    messages,
    onMessagesChange,
  ]);

  const handleAuthConfirm = useCallback(async () => {
    const pending = streamingState?.pendingAuth;
    if (!pending) return;
    await submitApproval({
      contextId: streamingState?.responseId || pending.taskId || '',
      taskId: pending.taskId || '',
      approved: true,
      responseType: 'oauth_confirm',
      successFallback: 'Authentication confirmed.',
      errorLabel: 'Authentication',
      errorCode: 'auth_confirmation_error',
    });
  }, [streamingState, submitApproval]);

  const handleSecretsSubmit = useCallback(
    async (secrets: Record<string, string>) => {
      const pending = streamingState?.pendingAuth;
      if (!pending) return;
      await submitApproval({
        contextId: streamingState?.responseId || pending.taskId || '',
        taskId: pending.taskId || '',
        approved: true,
        responseType: 'secrets_response',
        payload: JSON.stringify(secrets),
        successFallback: 'Secrets submitted successfully.',
        errorLabel: 'Secrets submission',
        errorCode: 'secrets_submission_error',
      });
    },
    [streamingState, submitApproval],
  );

  return {
    handleFormSubmit,
    handleFormCancel,
    handleAuthConfirm,
    handleSecretsSubmit,
  };
}
