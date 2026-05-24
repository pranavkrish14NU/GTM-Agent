/**
 * Ask BOBA — conversational AI chat interface.
 *
 * Features:
 *   - Multi-turn conversation with persistent conversation_id
 *   - Structured response cards: answer, evidence summary, citations, confidence badge, next actions
 *   - Typing indicator while awaiting LLM response
 *   - Error state with per-turn retry
 *   - "New chat" button to reset the conversation
 *   - Enter to send (Shift+Enter for newline)
 *
 * API: POST /v1/ask  (submitQuery)
 */

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ConfidenceBadge } from '../../components/common/index.js';
import { submitQuery } from './api.js';
import type { ChatTurn, AskCitation, AskResponse } from './types.js';
import styles from './Ask.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMimeIcon(url: string): string {
  if (url.includes('spreadsheets')) return '📊';
  if (url.includes('presentation')) return '📺';
  if (url.includes('document')) return '📄';
  return '📎';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CitationItemProps {
  citation: AskCitation;
}

function CitationItem({ citation }: CitationItemProps) {
  const meta: string[] = [];
  if (citation.section) meta.push(citation.section);
  if (citation.page !== undefined) meta.push(`p.${citation.page}`);

  return (
    <li className={styles.sourceItem} data-testid="citation-item">
      <span className={styles.sourceIcon} aria-hidden="true">
        {getMimeIcon(citation.driveUrl)}
      </span>
      <a
        href={citation.driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.sourceLink}
        data-testid="citation-link"
        title={citation.sourceFileName}
      >
        {citation.sourceFileName}
      </a>
      {meta.length > 0 && (
        <span className={styles.sourceMeta} data-testid="citation-meta">
          {meta.join(' · ')}
        </span>
      )}
      <span className={styles.sourceScore} data-testid="citation-score">
        {citation.relevanceScore}%
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// AssistantCard
// ---------------------------------------------------------------------------

interface AssistantCardProps {
  response: AskResponse;
}

function AssistantCard({ response }: AssistantCardProps) {
  return (
    <div className={styles.assistantCard} data-testid="assistant-card">
      {/* BOBA label + confidence */}
      <div className={styles.assistantHeader}>
        <span className={styles.assistantAvatar} aria-hidden="true">🤖</span>
        <span className={styles.assistantLabel}>BOBA</span>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Confidence</span>
          <ConfidenceBadge level={response.confidence_level} />
        </div>
      </div>

      {/* Main answer */}
      <p className={styles.answerText} data-testid="answer-text">
        {response.answer}
      </p>

      {/* Evidence summary */}
      {response.evidence_summary && (
        <div className={styles.evidence} data-testid="evidence-summary">
          <p className={styles.evidenceLabel}>Evidence</p>
          <p className={styles.evidenceText}>{response.evidence_summary}</p>
        </div>
      )}

      {/* Source citations */}
      {response.sources.length > 0 && (
        <div className={styles.sourcesSection} data-testid="sources-section">
          <p className={styles.sourcesHeading}>Sources ({response.sources.length})</p>
          <ul className={styles.sourcesList}>
            {response.sources.map((c) => (
              <CitationItem key={c.chunkId} citation={c} />
            ))}
          </ul>
        </div>
      )}

      {/* Suggested next actions */}
      {response.suggested_next_actions.length > 0 && (
        <div className={styles.nextActions} data-testid="next-actions">
          <p className={styles.nextActionsHeading}>Next Actions</p>
          <ul className={styles.nextActionsList}>
            {response.suggested_next_actions.map((action, i) => (
              <li key={i} className={styles.nextActionItem} data-testid="next-action-item">
                <span className={styles.nextActionBullet} aria-hidden="true">→</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className={`${styles.turn} ${styles.turnAssistant}`} data-testid="typing-indicator">
      <div className={styles.typingCard}>
        <div className={styles.typingDots} aria-label="BOBA is thinking…">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
        <span className={styles.typingLabel}>Thinking…</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatTurnView — renders one turn in the transcript
// ---------------------------------------------------------------------------

interface ChatTurnViewProps {
  turn: ChatTurn;
  onRetry: (query: string) => void;
}

function ChatTurnView({ turn, onRetry }: ChatTurnViewProps) {
  if (turn.type === 'user') {
    return (
      <div className={`${styles.turn} ${styles.turnUser}`} data-testid="turn-user">
        <div className={styles.userBubble} data-testid="user-bubble">
          {turn.text}
        </div>
      </div>
    );
  }

  if (turn.type === 'assistant') {
    return (
      <div className={`${styles.turn} ${styles.turnAssistant}`} data-testid="turn-assistant">
        <AssistantCard response={turn.response} />
      </div>
    );
  }

  // type === 'error'
  return (
    <div className={`${styles.turn} ${styles.turnError}`} data-testid="turn-error">
      <div className={styles.errorBubble}>
        <p className={styles.errorText} data-testid="error-text">
          ⚠️ {turn.error}
        </p>
        <button
          className={styles.retryButton}
          type="button"
          data-testid="retry-button"
          onClick={() => onRetry(turn.query)}
          aria-label="Retry question"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AskModule — root component
// ---------------------------------------------------------------------------

export default function AskModule() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  // Auto-scroll transcript to the bottom after each new turn
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns, isLoading]);

  const sendQuery = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userTurnId = `u-${Date.now()}`;
    setTurns((prev) => [...prev, { type: 'user', id: userTurnId, text: query }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await submitQuery(query, conversationId ?? undefined);
      setConversationId(response.conversation_id);
      setTurns((prev) => [
        ...prev,
        { type: 'assistant', id: `a-${response.query_id}`, response },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setTurns((prev) => [
        ...prev,
        { type: 'error', id: `e-${Date.now()}`, query, error: message },
      ]);
    } finally {
      setIsLoading(false);
      // Restore focus to the textarea after response
      textareaRef.current?.focus();
    }
  }, [conversationId, isLoading]);

  const handleRetry = useCallback((query: string) => {
    // Remove the error turn before retrying so we don't show stacked errors
    setTurns((prev) => prev.filter((t) => !(t.type === 'error' && t.query === query)));
    sendQuery(query);
  }, [sendQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery(inputValue);
    }
  };

  const handleNewChat = () => {
    setTurns([]);
    setConversationId(null);
    setInputValue('');
    textareaRef.current?.focus();
  };

  return (
    <div className={styles.page} data-testid="ask-module">
      {/* Page header */}
      <header className={styles.header}>
        <h1 className={styles.heading}>💬 Ask BOBA</h1>
        <p className={styles.subheading}>
          Ask questions about your GTM strategy — BOBA answers from your indexed documents.
        </p>
      </header>

      {/* New chat / clear button — only shown when there are turns */}
      {turns.length > 0 && (
        <button
          className={styles.newChatButton}
          type="button"
          onClick={handleNewChat}
          data-testid="new-chat-button"
          aria-label="Start a new conversation"
        >
          ✦ New chat
        </button>
      )}

      {/* Chat transcript */}
      <div
        ref={transcriptRef}
        className={styles.transcript}
        role="log"
        aria-label="Conversation history"
        aria-live="polite"
        data-testid="transcript"
      >
        {turns.length === 0 && !isLoading ? (
          <div className={styles.welcome} data-testid="welcome-state">
            <span className={styles.welcomeIcon} aria-hidden="true">💡</span>
            <p className={styles.welcomeTitle}>What would you like to know?</p>
            <p className={styles.welcomeHint}>
              Ask about brand voice, personas, competitive landscape, messaging — anything in your Drive.
            </p>
          </div>
        ) : (
          <>
            {turns.map((turn) => (
              <ChatTurnView key={turn.id} turn={turn} onRetry={handleRetry} />
            ))}
            {isLoading && <TypingIndicator />}
          </>
        )}
      </div>

      {/* Input area */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <label htmlFor={inputId} className="sr-only">
            Ask BOBA a question
          </label>
          <textarea
            id={inputId}
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Ask a question about your GTM strategy…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            aria-label="Ask BOBA a question"
            data-testid="query-input"
          />
          <button
            className={styles.sendButton}
            type="button"
            onClick={() => sendQuery(inputValue)}
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send question"
            data-testid="send-button"
          >
            {isLoading ? '…' : '↑ Send'}
          </button>
        </div>
        <p className={styles.inputHint}>Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
