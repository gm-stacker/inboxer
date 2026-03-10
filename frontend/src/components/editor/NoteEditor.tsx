import React, { useState, useRef, useEffect, useCallback } from 'react';
import { uploadMediaCapture, deleteNote, markNoteAsDone, unmarkNoteAsDone, moveNote, reanalyzeNote, getMediaUrl } from '../../services/api';
import type { SelectedNote, TaxonomyCategory } from '../../types';
import { parseNoteContent, joinNoteContent } from '../../utils/noteUtils';

interface EditorActions {
    onClose: () => void;
    onUpdateContent: (newContent: string) => void;
    onNoteDeleted: () => void;
    onNoteMoved: (targetCategory: string) => void;
    onOpenSettings: () => void;
    showToast: (msg: string) => void;
    setStatusMessage: (msg: string) => void;
}

export interface NoteEditorProps {
    note: SelectedNote;
    taxonomies: TaxonomyCategory[];
    isSaving: boolean;
    actions: EditorActions;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
    note,
    taxonomies,
    isSaving,
    actions
}) => {
    // Local state for immediate typing (avoids DOM thrashing)
    const [localTitle, setLocalTitle] = useState('');
    const [localChunks, setLocalChunks] = useState<string[]>([]);

    // UI State extracted from App.tsx
    const [isPropertiesExpanded, setIsPropertiesExpanded] = useState(false);
    const [moveToCategory, setMoveToCategory] = useState('');
    const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
    const [isUploadingToNote, setIsUploadingToNote] = useState(false);
    const [isReanalyzing, setIsReanalyzing] = useState(false);

    const noteFileInputRef = useRef<HTMLInputElement>(null);

    // We use a ref to track the latest chunks without adding it to the debounce dependency array
    // which would cause it to reset on every keystroke.
    const latestChunksRef = useRef<string[]>([]);
    const latestTitleRef = useRef<string>('');
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initialize local state when note changes
    useEffect(() => {
        const { props, body } = parseNoteContent(note.content);
        const initialTitle = props.title || '';
        const initialChunks = body.split(/(!\[\[.*?\]\])/g);

        setLocalTitle(initialTitle);
        setLocalChunks(initialChunks);
        latestTitleRef.current = initialTitle;
        latestChunksRef.current = initialChunks;

        // Reset structural UI states on new note
        setIsPropertiesExpanded(false);
        setNoteToDelete(null);
    }, [note.filename, note.category, note.content]); // Re-sync when the upstream note genuinely changes

    // Push local state to parent
    const syncToParent = useCallback(() => {
        const { props } = parseNoteContent(note.content);
        const newProps = { ...props, title: latestTitleRef.current };
        const newBody = latestChunksRef.current.join('');
        actions.onUpdateContent(joinNoteContent(newProps, newBody));
    }, [note.content, actions]);

    // Debounced auto-sync (Safety net if they don't blur)
    useEffect(() => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        syncTimeoutRef.current = setTimeout(() => {
            syncToParent();
        }, 2000); // 2 seconds after last keystroke
        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [localTitle, localChunks, syncToParent]);

    // Handle manual blur to sync immediately
    const handleBlur = () => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncToParent();
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalTitle(e.target.value);
        latestTitleRef.current = e.target.value;
    };

    const handleChunkChange = (index: number, value: string, target?: HTMLTextAreaElement) => {
        if (target) {
            target.style.height = '0px';
            target.style.height = target.scrollHeight + 'px';
        }
        const newChunks = [...localChunks];
        newChunks[index] = value;
        setLocalChunks(newChunks);
        latestChunksRef.current = newChunks;
    };

    const handleNoteFileUpload = useCallback(async (file: File, cursorChunkIndex: number, cursorPos: number) => {
        setIsUploadingToNote(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', note.category);
            const res = await uploadMediaCapture(formData);
            if (res.ok) {
                const embed = file.type.startsWith('image') ? `![[${file.name.replace(/ /g, '_')}]]` : `[[${file.name.replace(/ /g, '_')}]]`;
                const chunks = [...latestChunksRef.current];
                const chunk = chunks[cursorChunkIndex] || '';
                chunks[cursorChunkIndex] = chunk.slice(0, cursorPos) + `\n${embed}\n` + chunk.slice(cursorPos);
                setLocalChunks(chunks);
                latestChunksRef.current = chunks;
                syncToParent();
            } else {
                console.error('Upload failed', await res.text());
                actions.showToast('Failed to upload file');
            }
        } catch (err) {
            console.error('Upload error', err);
            actions.showToast('Network error uploading file');
        } finally {
            setIsUploadingToNote(false);
        }
    }, [note.category, actions, syncToParent]);

    const handleNoteFileSelect = useCallback(async (file: File) => {
        setIsUploadingToNote(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', note.category);
            const res = await uploadMediaCapture(formData);
            if (res.ok) {
                const embed = file.type.startsWith('image') ? `![[${file.name.replace(/ /g, '_')}]]` : `[[${file.name.replace(/ /g, '_')}]]`;
                const chunks = [...latestChunksRef.current];
                chunks.push(`\n\n${embed}\n`);
                setLocalChunks(chunks);
                latestChunksRef.current = chunks;
                syncToParent();
            } else {
                console.error('Upload failed', await res.text());
                actions.showToast('Failed to upload file');
            }
        } catch (err) {
            console.error('Upload error', err);
            actions.showToast('Network error uploading file');
        } finally {
            setIsUploadingToNote(false);
        }
    }, [note.category, actions, syncToParent]);

    const handleDeleteNote = async () => {
        try {
            await deleteNote(note.category, note.filename);
            actions.onNoteDeleted();
            actions.showToast('Note deleted');
        } catch (err) {
            console.error(err);
            actions.showToast('Network error deleting note');
        }
    };

    const handleMarkAsDone = async () => {
        try {
            await markNoteAsDone(note.category, note.filename);
            actions.onNoteDeleted(); // Effectively the same as deleted from the open view
            actions.showToast('Note moved to Completed.');
        } catch (err) {
            console.error(err);
            actions.showToast('Network error marking note as done.');
        }
    };

    const handleUnmarkAsDone = async () => {
        try {
            actions.showToast('Unmarking note as done...');
            await unmarkNoteAsDone(note.category, note.filename);
            actions.onNoteDeleted();
            actions.showToast('Note removed from Completed.');
        } catch (err) {
            console.error(err);
            actions.showToast('Network error unmarking note as done.');
        }
    };

    const handleMoveNote = async () => {
        if (!moveToCategory) return;
        try {
            await moveNote(note.category, note.filename, moveToCategory);
            setIsPropertiesExpanded(false);
            actions.onNoteMoved(note.category); // Pass old category so parent knows what to refresh
            actions.showToast(`Note moved to ${moveToCategory}`);
        } catch (err) {
            console.error(err);
            actions.showToast('Network error moving note');
        }
    };

    const handleReanalyze = async () => {
        if (isReanalyzing) return;
        setIsReanalyzing(true);
        actions.setStatusMessage('Re-analyzing with AI Engine...');

        const parsed = parseNoteContent(note.content);
        // Remove transient generated fields so we re-run them
        const protectedProps = { ...parsed.props };
        delete protectedProps.summary;
        delete protectedProps.actionItems;
        delete protectedProps.patterns;
        const cleanedContent = joinNoteContent(protectedProps, parsed.body);

        try {
            const res = await reanalyzeNote(note.category, note.filename, cleanedContent);
            const data = await res.json();
            actions.onUpdateContent(data.content);
            actions.setStatusMessage('');
        } catch (err) {
            console.error('Reanalyze error:', err);
            actions.setStatusMessage('Network Error during re-analyze.');
        } finally {
            setIsReanalyzing(false);
        }
    };

    const parsedContent = parseNoteContent(note.content); // For props rendering

    return (
        <div className="note-editor">
            <header className="editor-header">
                <div className="editor-breadcrumbs">
                    <button
                        className="back-btn"
                        onClick={actions.onClose}
                        title="Back to home"
                    >
                        <span className="material-icons" style={{ fontSize: '20px' }}>arrow_back</span>
                    </button>
                    <span>vault</span>
                    <span>/</span>
                    <span>{note.category}</span>
                </div>

                <div className="editor-header-actions">
                    <button className="icon-btn" onClick={actions.onOpenSettings} title="Vault Config">
                        <span className="material-icons" style={{ fontSize: '18px' }}>settings</span>
                    </button>
                    <button className="icon-btn" title="View Grid">
                        <span className="material-icons" style={{ fontSize: '18px' }}>grid_view</span>
                    </button>
                    <button className="icon-btn" onClick={actions.onClose} title="Home">
                        <span className="material-icons" style={{ fontSize: '18px' }}>home</span>
                    </button>
                </div>
            </header>

            <input
                className="editor-title-input"
                value={localTitle}
                onChange={handleTitleChange}
                onBlur={handleBlur}
                placeholder="Note title..."
            />

            {/* Hidden file input for note editor */}
            <input
                type="file"
                ref={noteFileInputRef}
                style={{ display: 'none' }}
                accept="image/*,application/pdf"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleNoteFileSelect(file);
                    e.target.value = '';
                }}
            />

            <div className="editor-toolbar">
                <div className="toolbar-group">
                    <span className="material-icons toolbar-icon">undo</span>
                    <span className="material-icons toolbar-icon">redo</span>
                </div>
                <div className="toolbar-group">
                    <span className="material-icons toolbar-icon">format_bold</span>
                    <span className="material-icons toolbar-icon">format_italic</span>
                    <span className="material-icons toolbar-icon">format_underlined</span>
                    <span className="material-icons toolbar-icon">strikethrough_s</span>
                </div>
                <div className="toolbar-group">
                    <span className="material-icons toolbar-icon">link</span>
                    <span className="material-icons toolbar-icon">code</span>
                    <span className="material-icons toolbar-icon">format_list_bulleted</span>
                    <span className="material-icons toolbar-icon">checklist_rtl</span>
                </div>
                <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
                    <span
                        className="material-icons toolbar-icon"
                        title="Attach file"
                        onClick={() => noteFileInputRef.current?.click()}
                        style={{ cursor: 'pointer' }}
                    >attach_file</span>
                    {isUploadingToNote && <span className="toolbar-uploading">uploading...</span>}
                </div>
            </div>

            <div className="inline-editor">
                {localChunks.map((chunk: string, i: number) => {
                    const match = chunk.match(/!\[\[(.*?)\]\]/);
                    if (match) {
                        const imgName = match[1];
                        let imgUrl = getMediaUrl(note.category, imgName);

                        if (imgName.toLowerCase().endsWith('.heic')) {
                            imgUrl += '.jpg';
                        }

                        return (
                            <div key={i} className="inline-image-wrapper">
                                <input
                                    className="inline-image-syntax"
                                    value={chunk}
                                    style={{ display: 'none' }}
                                    onChange={() => { }}
                                />
                                <img
                                    src={imgUrl}
                                    alt={imgName}
                                    onClick={() => window.open(imgUrl, '_blank')}
                                />
                                <button
                                    className="delete-image-overlay"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newChunks = [...localChunks];
                                        newChunks[i] = ''; // Set chunk to empty string to remove it
                                        setLocalChunks(newChunks);
                                        latestChunksRef.current = newChunks;
                                        syncToParent();
                                    }}
                                    title="Remove Image"
                                >
                                    <span className="material-icons" style={{ fontSize: '18px' }}>close</span>
                                </button>
                            </div>
                        );
                    }

                    // Normal Text Chunk
                    return (
                        <textarea
                            key={i}
                            className="editor-textarea chunked-textarea"
                            value={chunk}
                            ref={(el) => {
                                if (el) {
                                    el.style.height = '0px';
                                    el.style.height = el.scrollHeight + 'px';
                                }
                            }}
                            onChange={(e) => handleChunkChange(i, e.target.value, e.target)}
                            onBlur={handleBlur}
                            onPaste={(e) => {
                                const files = e.clipboardData.files;
                                if (files && files.length > 0) {
                                    e.preventDefault();
                                    const cursorPos = (e.target as HTMLTextAreaElement).selectionStart;
                                    handleNoteFileUpload(files[0], i, cursorPos);
                                }
                            }}
                            style={{ overflow: 'hidden', resize: 'none' }}
                            placeholder={i === 0 ? "Start writing..." : ""}
                        />
                    );
                })}
            </div>

            <div className="editor-bottom-action-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        className="btn btn-outline-amber btn-reanalyze"
                        onClick={handleReanalyze}
                        disabled={isReanalyzing}
                        title="Re-analyze"
                    >
                        <span className="material-icons" style={{ fontSize: '16px' }}>
                            {isReanalyzing ? 'sync' : 'auto_awesome'}
                        </span>
                        <span className="reanalyze-label">Re-analyze</span>
                    </button>

                    <div className="move-group" style={{ display: 'flex', gap: '8px' }}>
                        <select
                            className="editor-select"
                            value={moveToCategory}
                            onChange={(e) => setMoveToCategory(e.target.value)}
                        >
                            <option value="">Move to...</option>
                            {taxonomies.map(cat => (
                                <option key={cat.name} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={handleMoveNote}>Move</button>
                    </div>
                </div>

                <div className="action-group" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="editor-meta" style={{ marginRight: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isSaving ? 'Saving...' : 'Saved'}</span>
                    {/tags:[\s\S]*?- done/.test(note.content) ? (
                        <button className="btn btn-secondary" onClick={handleUnmarkAsDone} title="Unmark as done">↺ Undone</button>
                    ) : (
                        <button className="btn btn-done" onClick={handleMarkAsDone} title="Mark as done">✓ Done</button>
                    )}
                    {noteToDelete === note.filename ? (
                        <div className="delete-confirm-inline" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-raised)', padding: '4px 8px', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Delete?</span>
                            <button className="icon-btn" onClick={() => { handleDeleteNote(); setNoteToDelete(null); }} style={{ color: '#ef4444' }}>Yes</button>
                            <button className="icon-btn" onClick={() => setNoteToDelete(null)}>No</button>
                        </div>
                    ) : (
                        <button className="btn btn-warning icon-btn" onClick={() => setNoteToDelete(note.filename)} title="Delete note">
                            <span className="material-icons" style={{ fontSize: '18px' }}>delete</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Properties Bar Footer */}
            {Object.keys(parsedContent.props).length > 0 && (
                <div className="properties-bar-container">
                    <div className="properties-bar" onClick={() => setIsPropertiesExpanded(!isPropertiesExpanded)}>
                        <div className="properties-bar-left">
                            <span
                                className="chevron-icon"
                                style={{ transform: isPropertiesExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                            >
                                ▸
                            </span>
                            <span className="properties-bar-label">PROPERTIES</span>
                        </div>
                        <div className="properties-bar-right">
                            <span>Created: {parsedContent.props.created || '-'}</span>
                        </div>
                    </div>
                    {isPropertiesExpanded && (
                        <div className="properties-grid-sidebar">
                            {Object.entries(parsedContent.props).map(([key, value]) => (
                                <div key={key} className="property-sidebar-row">
                                    <span className="property-sidebar-key">{key}</span>
                                    <span className="property-sidebar-value">
                                        {Array.isArray(value) ? (
                                            <div className="property-tags">
                                                {value.map((tag, i) => <span key={i} className="prop-tag">{tag}</span>)}
                                            </div>
                                        ) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
