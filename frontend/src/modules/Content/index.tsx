/**
 * Content Studio page — ✍️ Content Studio
 *
 * Features:
 *   - Generation form: content type, topic, tone, length, channel, target persona
 *   - ContentEditor: displays generated content with brand-voice and persona-fit scores
 *   - Regenerate: re-runs generation with the same parameters
 *   - Refine: adds instructions and regenerates (builds on existing content_id)
 *   - Save-to-Drive: folder picker → exports content via WO-040 API
 *   - Drafts sidebar: list of previously generated content
 *   - Loading, empty, and error states throughout
 *
 * API: POST /v1/content/generate       (generateContent)
 *      POST /v1/content/refine          (refineContent)
 *      GET  /v1/content/drafts          (getDrafts)
 *      GET  /v1/content/drive/folders   (getDriveFolders)
 *      POST /v1/content/save-to-drive   (saveContentToDrive)
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import {
  generateContent,
  refineContent,
  getDrafts,
  getDriveFolders,
  saveContentToDrive,
} from './api.js';
import type {
  GenerationParams,
  GeneratedContent,
  ContentDraft,
  DriveFolder,
  ContentType,
  ToneType,
  LengthType,
  ChannelType,
} from './types.js';
import {
  CONTENT_TYPE_LABELS,
  TONE_LABELS,
  LENGTH_LABELS,
  CHANNEL_LABELS,
  getScoreTier,
} from './types.js';
import styles from './Content.module.css';

// ---------------------------------------------------------------------------
// ScoreBadge — brand voice / persona fit chip
// ---------------------------------------------------------------------------

function ScoreBadge({
  label,
  score,
  testId,
}: {
  label: string;
  score: number;
  testId: string;
}) {
  const tier = getScoreTier(score);
  return (
    <span className={`${styles.scoreChip} ${styles[tier]}`} data-testid={testId}>
      {label}: {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ContentEditor — displays generated content with toolbar
// ---------------------------------------------------------------------------

interface ContentEditorProps {
  content: GeneratedContent;
  onRegenerate: () => void;
  onToggleRefine: () => void;
  onSaveToDrive: () => void;
  isRegenerating: boolean;
  isRefining: boolean;
  showRefinePanel: boolean;
  refineInstructions: string;
  onRefineInstructionsChange: (v: string) => void;
  onSubmitRefine: () => void;
  isSaving: boolean;
}

function ContentEditor({
  content,
  onRegenerate,
  onToggleRefine,
  onSaveToDrive,
  isRegenerating,
  isRefining,
  showRefinePanel,
  refineInstructions,
  onRefineInstructionsChange,
  onSubmitRefine,
  isSaving,
}: ContentEditorProps) {
  return (
    <div className={styles.editorSection} data-testid="content-editor">
      {/* Header: title + scores */}
      <div className={styles.editorHeader}>
        <h2 className={styles.contentTitle} data-testid="content-title">
          {content.title}
        </h2>
        <div className={styles.scoreRow}>
          <ScoreBadge
            label="Brand Voice"
            score={content.brand_voice_score}
            testId="brand-voice-score"
          />
          {content.persona_fit_score !== null && (
            <ScoreBadge
              label="Persona Fit"
              score={content.persona_fit_score}
              testId="persona-fit-score"
            />
          )}
        </div>
      </div>

      {/* Content body */}
      <div className={styles.contentBody} data-testid="content-body">
        {content.body}
      </div>

      {/* Source citations */}
      {content.sources.length > 0 && (
        <div className={styles.sourcesSection}>
          <p className={styles.sourcesSectionTitle}>Sources</p>
          <div className={styles.sourcesList} data-testid="sources-list">
            {content.sources.map((source) => (
              <div key={source.sourceFileId} className={styles.sourceItem} data-testid="source-item">
                <span className={styles.sourceName}>{source.sourceFileName}</span>
                <span className={styles.sourceRelevance}>{source.relevanceScore}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refine panel */}
      {showRefinePanel && (
        <div className={styles.refinePanel} data-testid="refine-panel">
          <p className={styles.refinePanelTitle}>✏️ Refine instructions</p>
          <textarea
            className={styles.refineTextarea}
            placeholder="E.g. Make it shorter, add a CTA, focus on security…"
            value={refineInstructions}
            onChange={(e) => onRefineInstructionsChange(e.target.value)}
            data-testid="refine-input"
            rows={3}
          />
          <div className={styles.refineActions}>
            <button
              type="button"
              className={`${styles.toolbarButton} ${styles.primary}`}
              onClick={onSubmitRefine}
              disabled={isRefining || !refineInstructions.trim()}
              data-testid="submit-refine-button"
            >
              {isRefining ? '⟳ Refining…' : '✓ Apply Refinement'}
            </button>
            <button
              type="button"
              className={`${styles.toolbarButton} ${styles.secondary}`}
              onClick={onToggleRefine}
              disabled={isRefining}
              data-testid="cancel-refine-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.editorToolbar}>
        <button
          type="button"
          className={`${styles.toolbarButton} ${styles.secondary}`}
          onClick={onRegenerate}
          disabled={isRegenerating || isRefining}
          data-testid="regenerate-button"
        >
          {isRegenerating ? '⟳ Regenerating…' : '⟳ Regenerate'}
        </button>

        <button
          type="button"
          className={`${styles.toolbarButton} ${styles.secondary}`}
          onClick={onToggleRefine}
          disabled={isRegenerating || isRefining}
          data-testid="refine-button"
        >
          ✏️ Refine
        </button>

        <button
          type="button"
          className={`${styles.toolbarButton} ${styles.success}`}
          onClick={onSaveToDrive}
          disabled={isSaving}
          data-testid="save-to-drive-button"
        >
          {isSaving ? '⟳ Saving…' : '💾 Save to Drive'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FolderPickerDialog — modal for choosing a Drive folder
// ---------------------------------------------------------------------------

interface FolderPickerDialogProps {
  folders: DriveFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

function FolderPickerDialog({
  folders,
  selectedFolderId,
  onSelectFolder,
  onConfirm,
  onCancel,
  isSaving,
}: FolderPickerDialogProps) {
  return (
    <div className={styles.folderPickerOverlay} data-testid="folder-picker">
      <div className={styles.folderPickerDialog} role="dialog" aria-modal="true">
        <h2 className={styles.folderPickerTitle}>Choose a Drive Folder</h2>
        <div className={styles.folderList}>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`${styles.folderItem} ${selectedFolderId === folder.id ? styles.selected : ''}`}
              onClick={() => onSelectFolder(folder.id)}
              data-testid="drive-folder-item"
            >
              📁 {folder.name}
            </button>
          ))}
        </div>
        <div className={styles.folderPickerActions}>
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.secondary}`}
            onClick={onCancel}
            data-testid="cancel-save-button"
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.primary}`}
            onClick={onConfirm}
            disabled={!selectedFolderId || isSaving}
            data-testid="confirm-save-button"
          >
            {isSaving ? '⟳ Saving…' : '💾 Save Here'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraftsSidebar — list of previous drafts
// ---------------------------------------------------------------------------

function DraftsSidebar({ drafts, onSelectDraft }: { drafts: ContentDraft[]; onSelectDraft: (d: ContentDraft) => void }) {
  return (
    <aside className={styles.draftsSidebar}>
      <p className={styles.draftsTitle}>📄 Previous Drafts</p>
      {drafts.length === 0 ? (
        <p className={styles.noDrafts} data-testid="no-drafts">
          No drafts yet.
        </p>
      ) : (
        <div className={styles.draftsList} data-testid="drafts-list">
          {drafts.map((draft) => (
            <div
              key={draft.content_id}
              className={styles.draftItem}
              data-testid="draft-item"
              onClick={() => onSelectDraft(draft)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectDraft(draft);
              }}
            >
              <p className={styles.draftTitle}>{draft.title}</p>
              <p className={styles.draftMeta}>
                {CONTENT_TYPE_LABELS[draft.content_type]} · {formatRelativeTime(draft.created_at)} · Voice: {draft.brand_voice_score}
              </p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// GenerationForm — form inputs for content generation
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: GenerationParams = {
  content_type: 'blog_post',
  topic: '',
  tone: 'formal',
  length: 'medium',
  channel: 'linkedin',
};

function GenerationForm({
  params,
  onParamsChange,
  onSubmit,
  isGenerating,
}: {
  params: GenerationParams;
  onParamsChange: (p: GenerationParams) => void;
  onSubmit: () => void;
  isGenerating: boolean;
}) {
  return (
    <div className={styles.generationForm} data-testid="generation-form">
      <p className={styles.formTitle}>Generate Content</p>
      <div className={styles.formGrid}>
        {/* Content type */}
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="content-type">
            Content Type
          </label>
          <select
            id="content-type"
            className={styles.formSelect}
            value={params.content_type}
            onChange={(e) =>
              onParamsChange({ ...params, content_type: e.target.value as ContentType })
            }
            data-testid="content-type-select"
          >
            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Tone */}
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="tone">
            Tone
          </label>
          <select
            id="tone"
            className={styles.formSelect}
            value={params.tone}
            onChange={(e) =>
              onParamsChange({ ...params, tone: e.target.value as ToneType })
            }
            data-testid="tone-select"
          >
            {(Object.keys(TONE_LABELS) as ToneType[]).map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Length */}
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="length">
            Length
          </label>
          <select
            id="length"
            className={styles.formSelect}
            value={params.length}
            onChange={(e) =>
              onParamsChange({ ...params, length: e.target.value as LengthType })
            }
            data-testid="length-select"
          >
            {(Object.keys(LENGTH_LABELS) as LengthType[]).map((l) => (
              <option key={l} value={l}>
                {LENGTH_LABELS[l]}
              </option>
            ))}
          </select>
        </div>

        {/* Channel */}
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="channel">
            Channel
          </label>
          <select
            id="channel"
            className={styles.formSelect}
            value={params.channel}
            onChange={(e) =>
              onParamsChange({ ...params, channel: e.target.value as ChannelType })
            }
            data-testid="channel-select"
          >
            {(Object.keys(CHANNEL_LABELS) as ChannelType[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {/* Topic */}
        <div className={`${styles.formField} ${styles.fullWidth}`}>
          <label className={styles.formLabel} htmlFor="topic">
            Topic / Brief
          </label>
          <textarea
            id="topic"
            className={styles.formTextarea}
            placeholder="Describe what you want to generate…"
            value={params.topic}
            onChange={(e) => onParamsChange({ ...params, topic: e.target.value })}
            data-testid="topic-input"
          />
        </div>

        {/* Target persona (optional) */}
        <div className={`${styles.formField} ${styles.fullWidth}`}>
          <label className={styles.formLabel} htmlFor="persona">
            Target Persona (optional)
          </label>
          <input
            id="persona"
            className={styles.formInput}
            type="text"
            placeholder="Persona ID or leave blank"
            value={params.target_persona ?? ''}
            onChange={(e) =>
              onParamsChange({
                ...params,
                target_persona: e.target.value || undefined,
              })
            }
            data-testid="persona-select"
          />
        </div>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.generateButton}
          onClick={onSubmit}
          disabled={isGenerating || !params.topic.trim()}
          data-testid="generate-button"
        >
          {isGenerating ? '⟳ Generating…' : '✨ Generate'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content — main page component
// ---------------------------------------------------------------------------

export default function Content() {
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const [refineInstructions, setRefineInstructions] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load drafts on mount
  useEffect(() => {
    getDrafts()
      .then((result) => setDrafts(result.drafts))
      .catch(() => {
        /* Non-fatal: drafts sidebar is optional */
      });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!params.topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    setSaveMessage(null);
    try {
      const content = await generateContent(params);
      setGeneratedContent(content);
      // Refresh drafts
      const draftsResult = await getDrafts();
      setDrafts(draftsResult.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Content generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [params]);

  const handleRegenerate = useCallback(async () => {
    if (!params.topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const content = await generateContent(params);
      setGeneratedContent(content);
      const draftsResult = await getDrafts();
      setDrafts(draftsResult.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsGenerating(false);
    }
  }, [params]);

  const handleToggleRefine = useCallback(() => {
    setShowRefinePanel((prev) => !prev);
    setRefineInstructions('');
  }, []);

  const handleSubmitRefine = useCallback(async () => {
    if (!generatedContent || !refineInstructions.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
      const refined = await refineContent({
        content_id: generatedContent.content_id,
        instructions: refineInstructions,
      });
      setGeneratedContent(refined);
      setShowRefinePanel(false);
      setRefineInstructions('');
      const draftsResult = await getDrafts();
      setDrafts(draftsResult.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refine failed');
    } finally {
      setIsRefining(false);
    }
  }, [generatedContent, refineInstructions]);

  const handleOpenFolderPicker = useCallback(async () => {
    setSaveMessage(null);
    try {
      const folders = await getDriveFolders();
      setDriveFolders(folders);
      setSelectedFolderId(null);
      setShowFolderPicker(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Drive folders');
    }
  }, []);

  const handleConfirmSave = useCallback(async () => {
    if (!generatedContent || !selectedFolderId) return;
    setIsSavingToDrive(true);
    try {
      const result = await saveContentToDrive({
        content_id: generatedContent.content_id,
        folder_id: selectedFolderId,
      });
      setSaveMessage(result.message);
      setShowFolderPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save to Drive failed');
      setShowFolderPicker(false);
    } finally {
      setIsSavingToDrive(false);
    }
  }, [generatedContent, selectedFolderId]);

  const handleSelectDraft = useCallback((draft: ContentDraft) => {
    // Pre-fill the form with the draft's content type; user can regenerate
    setParams((prev) => ({ ...prev, content_type: draft.content_type }));
  }, []);

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="content-heading">
            ✍️ Content Studio
          </h1>
          <p className={styles.pageSubtitle}>
            Multi-format content generation with brand voice controls, persona targeting, and Save-to-Drive.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <p className={styles.errorBanner} role="alert" data-testid="content-error">
          {error}
        </p>
      )}

      {/* Save success */}
      {saveMessage && (
        <p
          className={styles.errorBanner}
          style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}
          data-testid="save-success-message"
          role="status"
        >
          {saveMessage}
        </p>
      )}

      {/* Studio layout: main column + drafts sidebar */}
      <div className={styles.studioLayout}>
        {/* Left: form + editor */}
        <div>
          <GenerationForm
            params={params}
            onParamsChange={setParams}
            onSubmit={handleGenerate}
            isGenerating={isGenerating}
          />

          {/* Generating loading state */}
          {isGenerating && (
            <div className={styles.generatingState} data-testid="generate-loading">
              <span className={styles.generatingSpinner}>⟳</span>
              <span>Generating content…</span>
            </div>
          )}

          {/* Skeleton while loading form (drafts fetch) */}
          {!isGenerating && !generatedContent && (
            <div style={{ marginTop: '1.5rem' }}>
              <SkeletonLoader height="0" width="0" />
              {/* Intentionally empty — no skeleton shown for initial empty state */}
            </div>
          )}

          {/* Generated content editor */}
          {!isGenerating && generatedContent && (
            <ContentEditor
              content={generatedContent}
              onRegenerate={handleRegenerate}
              onToggleRefine={handleToggleRefine}
              onSaveToDrive={handleOpenFolderPicker}
              isRegenerating={isGenerating}
              isRefining={isRefining}
              showRefinePanel={showRefinePanel}
              refineInstructions={refineInstructions}
              onRefineInstructionsChange={setRefineInstructions}
              onSubmitRefine={handleSubmitRefine}
              isSaving={isSavingToDrive}
            />
          )}
        </div>

        {/* Right: drafts sidebar */}
        <DraftsSidebar drafts={drafts} onSelectDraft={handleSelectDraft} />
      </div>

      {/* Folder picker dialog */}
      {showFolderPicker && (
        <FolderPickerDialog
          folders={driveFolders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowFolderPicker(false)}
          isSaving={isSavingToDrive}
        />
      )}
    </div>
  );
}
