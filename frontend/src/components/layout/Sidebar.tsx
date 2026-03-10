import React from 'react';
import type { TaxonomyCategory, NotePreview, SearchResult, SelectedNote } from '../../types/index';
import { getDisplayTitle } from '../../utils/noteUtils';

export interface SidebarProps {
    API_BASE_URL: string;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    isSearching: boolean;
    searchResults: SearchResult[] | null;
    taxonomies: TaxonomyCategory[];
    selectedCategory: string | null;
    setSelectedCategory: (cat: string | null) => void;
    handleSelectCategory: (categoryName: string) => Promise<void>;
    isRenaming: string | null;
    setIsRenaming: (name: string | null) => void;
    renameValue: string;
    setRenameValue: (val: string) => void;
    handleRename: (oldName: string) => Promise<void>;
    categoryNotes: NotePreview[];
    selectedNote: SelectedNote | null;
    setSelectedNote: React.Dispatch<React.SetStateAction<SelectedNote | null>>;
    handleSelectNote: (filename: string) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent, targetCategory: string) => Promise<void>;
    handleDragStart: (e: React.DragEvent, filename: string, sourceCategory: string) => void;
    isCompletedExpanded: boolean;
    setIsCompletedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    completedNotes: Array<{ filename: string; category: string; doneAt: string }>;
    fetchCompletedNotes: () => Promise<void>;
}

export function Sidebar({
    API_BASE_URL,
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    taxonomies,
    selectedCategory,
    setSelectedCategory,
    handleSelectCategory,
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    handleRename,
    categoryNotes,
    selectedNote,
    setSelectedNote,
    handleSelectNote,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragStart,
    isCompletedExpanded,
    setIsCompletedExpanded,
    completedNotes,
    fetchCompletedNotes
}: SidebarProps) {

    const getTaxonomyIcon = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('inbox')) return '📂';
        if (n.includes('health') || n.includes('medical')) return '🩺';
        if (n.includes('family') || n.includes('people')) return '👥';
        if (n.includes('personal')) return '🗂️';
        if (n.includes('travel')) return '✈️';
        if (n.includes('finance') || n.includes('money')) return '💰';
        return '📁';
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-logo">
                    <span className="material-icons">inbox</span>
                </div>
                <span className="brand-text">Inboxer Vault</span>
            </div>

            <div className="search-container">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <nav className="sidebar-nav">
                <div className="taxonomy-list">
                    {searchQuery.trim() ? (
                        /* ── Search Results Mode ─────────────────────────────── */
                        isSearching ? (
                            <div className="search-empty-state">Searching…</div>
                        ) : searchResults && searchResults.length === 0 ? (
                            <div className="search-empty-state">No results for "{searchQuery}"</div>
                        ) : searchResults ? (() => {
                            // Group results by category
                            const grouped: Record<string, SearchResult[]> = {};
                            searchResults.forEach(r => {
                                if (!grouped[r.category]) grouped[r.category] = [];
                                grouped[r.category].push(r);
                            });
                            return Object.entries(grouped).map(([cat, notes]) => (
                                <div key={cat} className="taxonomy-item-wrapper">
                                    <div className="taxonomy-item search-result-category">
                                        <div className="taxonomy-item-label">
                                            <span className="tax-icon">{getTaxonomyIcon(cat)}</span>
                                            <span className="tax-name">{cat.replace(/_/g, ' ')}</span>
                                        </div>
                                        <span className="badge">{notes.length}</span>
                                    </div>
                                    <div className="notes-list">
                                        {notes.map(n => (
                                            <div
                                                key={n.filename}
                                                className={`note-item ${selectedNote?.filename === n.filename ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSelectedCategory(cat)
                                                    handleSelectNote(n.filename)
                                                }}
                                            >
                                                <div className="note-dot"></div>
                                                <div className="note-content">
                                                    <div className="note-title">{n.title || n.filename.replace('.md', '')}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })() : null
                    ) : (
                        /* ── Normal Taxonomy Mode ────────────────────────────── */
                        taxonomies
                            .map((cat) => (
                                <div key={cat.name} className="taxonomy-item-wrapper">
                                    <div
                                        className={`taxonomy-item ${selectedCategory === cat.name ? 'active' : ''}`}
                                        onClick={() => handleSelectCategory(cat.name)}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, cat.name)}
                                    >
                                        {isRenaming === cat.name ? (
                                            <input
                                                className="rename-input"
                                                autoFocus
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onBlur={() => handleRename(cat.name)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(cat.name)
                                                    if (e.key === 'Escape') setIsRenaming(null)
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div
                                                className="taxonomy-item-label"
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation()
                                                    setIsRenaming(cat.name)
                                                    setRenameValue(cat.name)
                                                }}
                                            >
                                                <span className="tax-icon">{getTaxonomyIcon(cat.name)}</span>
                                                <span className="tax-name">{cat.name.replace(/_/g, ' ')}</span>
                                            </div>
                                        )}
                                        <span className="badge">{cat.noteCount}</span>
                                    </div>

                                    {selectedCategory === cat.name && (
                                        <div className="notes-list">
                                            {categoryNotes
                                                .map(n => (
                                                    <div
                                                        key={n.filename}
                                                        className={`note-item ${selectedNote?.filename === n.filename ? 'active' : ''}`}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, n.filename, cat.name)}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleSelectNote(n.filename)
                                                        }}
                                                    >
                                                        <div className="note-dot"></div>
                                                        <div className="note-content">
                                                            <div className="note-title">
                                                                {getDisplayTitle(n.preview, n.filename)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            ))
                    )}
                </div>


                {/* Completed Section */}
                <div className="completed-section">
                    <div
                        className="completed-header taxonomy-item"
                        onClick={() => {
                            if (!isCompletedExpanded) fetchCompletedNotes();
                            setIsCompletedExpanded(p => !p);
                        }}
                    >
                        <div className="taxonomy-item-label">
                            <span className="tax-icon">✓</span>
                            <span className="tax-name">Completed</span>
                        </div>
                        <span className="badge">{completedNotes.length}</span>
                    </div>
                    {isCompletedExpanded && (
                        <div className="notes-list">
                            {completedNotes.length === 0 ? (
                                <div className="note-item" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                                    <div className="note-content"><div className="note-title">No completed notes</div></div>
                                </div>
                            ) : (
                                completedNotes.map(n => (
                                    <div
                                        key={n.filename}
                                        className={`note-item ${selectedNote?.filename === n.filename ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedCategory(n.category);
                                            fetch(`${API_BASE_URL}/api/taxonomy/${n.category}/notes/${n.filename}`)
                                                .then(r => r.json())
                                                .then(d => setSelectedNote({ filename: d.filename, content: d.content, category: d.category }))
                                                .catch(console.error);
                                        }}
                                    >
                                        <div className="note-dot" style={{ background: 'var(--c-ai-accent)' }}></div>
                                        <div className="note-content">
                                            <div className="note-title">{n.filename.replace('.md', '').replace(/_/g, ' ')}</div>
                                            {n.doneAt && (
                                                <div className="note-date" style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                                                    {new Date(n.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </nav>
        </aside>
    );
}
