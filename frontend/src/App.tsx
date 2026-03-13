import { useState, useEffect, useRef } from 'react';
import { getBriefing, getVaultConfig, saveVaultConfig, clearVaultConfig, renameCategory, getNoteDetail, updateNoteContent, getTaxonomies, getCategoryNotes, synthesizeEchoes, moveNote, saveConversation, submitChat, captureRawText } from './services/api';
import './App.css'
import type { SelectedNote, ChatTurn, ToastFlag, MorningBriefing, ChatMessage } from './types/index';
import { Sidebar } from './components/layout/Sidebar';
import { NoteEditor } from './components/editor/NoteEditor';
import { CaptureView } from './components/capture/CaptureView';
import { useTaxonomy } from './hooks/useTaxonomy';

// --- HELPERS ---


// Variables moved to session storage

function App() {
  // Properties Panel State
  // extracted to NoteEditor

  // Completed notes State
  const [completedNotes, setCompletedNotes] = useState<Array<{ filename: string; category: string; doneAt: string }>>([]);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  // Quick-Add State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')

  // Dynamic Echoes State
  const [dynamicEchoes, setDynamicEchoes] = useState<string[] | null>(null)
  const [isGeneratingEchoes, setIsGeneratingEchoes] = useState(false)

  // Morning Briefing State
  const [briefingData, setBriefingData] = useState<MorningBriefing | null>(null)
  const [isBriefingVisible, setIsBriefingVisible] = useState(false)

  // Morning Briefing State
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(false)
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false)



  // Ambient Contextual Chat State
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false)
  const [ambientChatHistory, setAmbientChatHistory] = useState<ChatTurn[]>([])
  const [ambientInput, setAmbientInput] = useState('')
  const [isAmbientTyping, setIsAmbientTyping] = useState(false)
  const [toastFlags, setToastFlags] = useState<ToastFlag[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Taxonomies State (Hook)
  const [selectedNote, setSelectedNote] = useState<SelectedNote | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const {
    taxonomies,
    selectedCategory, setSelectedCategory,
    categoryNotes, setCategoryNotes,
    searchQuery, setSearchQuery,
    searchResults,
    isSearching,
    fetchTaxonomy,
    handleSelectCategory,
    handleSelectSourceFile
  } = useTaxonomy({
    setSelectedNote,
    setToastFlags,
    setDynamicEchoes
  });

  // Capture Panel State (Hoisted)
  const [captureMode, setCaptureMode] = useState<'capture' | 'query'>('capture');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const preNoteState = useRef<{ captureMode: 'capture' | 'query'; chatHistory: ChatMessage[] } | null>(null);

  const handleTimelineNoteClick = (filename: string) => {
    preNoteState.current = { captureMode, chatHistory };
    handleSelectSourceFile(filename);
  };


  // Vault Config State
  const [vaultPath, setVaultPath] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isClearConfirming, setIsClearConfirming] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')

  const theme = 'dark' as const;

  const showToast = (message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    setToastFlags(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToastFlags(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Fetch Taxonomy, Config, and Briefing on Load
  useEffect(() => {
    fetchConfig()
    fetchTaxonomy()

    // Check morning briefing
    const today = new Date().toISOString().split('T')[0];
    if (sessionStorage.getItem('sessionDismissedDate') !== today) {
      fetchMorningBriefing();
    }
  }, [])

  const fetchMorningBriefing = async () => {
    setIsLoadingBriefing(true);
    try {
      const res = await getBriefing();
      const data = await res.json();
      setBriefingData(data);
      setIsBriefingVisible(true);
    } catch (err) {
      console.error('Failed to fetch morning briefing', err);
    } finally {
      setIsLoadingBriefing(false);
    }
  }

  const handleDismissBriefing = () => {
    setIsBriefingVisible(false);
    sessionStorage.setItem('sessionDismissedDate', new Date().toISOString().split('T')[0]);
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme])

  // Global Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedNote) { setSelectedNote(null); return; }
      if (isSettingsOpen) { setIsSettingsOpen(false); return; }
      if (isChatPanelOpen) { setIsChatPanelOpen(false); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNote, isSettingsOpen, isChatPanelOpen]);

  const fetchConfig = async () => {
    try {
      const res = await getVaultConfig();
      const data = await res.json();
      setVaultPath(data.vaultPath);
    } catch (err) {
      console.error('Failed to fetch config', err)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await saveVaultConfig(vaultPath);
      showToast('Vault path saved. The backend is tracking this directory.');
      setIsSettingsOpen(false);
      fetchTaxonomy();
    } catch (err) {
      console.error(err);
    }
  }

  const handleClearVault = async () => {
    if (clearConfirmText.toLowerCase() !== 'delete') return;

    try {
      await clearVaultConfig();
      showToast('Vault cleared successfully.');
      setIsClearing(false);
      setClearConfirmText('');
      setIsClearConfirming(false);
      setIsSettingsOpen(false);
      setSelectedNote(null);
      setSelectedCategory(null);
      fetchTaxonomy();
    } catch (err) {
      console.error(err);
      showToast('Network error clearing vault.');
    }
  }

  // Full-text search and Queue Processing Effects
  // Queue processing logic moved to CaptureView

  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Editor State

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue === oldName) {
      setIsRenaming(null)
      return
    }

    try {
      await renameCategory(oldName, renameValue);
      setIsRenaming(null)
      if (selectedCategory === oldName) {
        setSelectedCategory(renameValue)
      }
      await fetchTaxonomy()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSelectNote = async (filename: string) => {
    if (!selectedCategory) return
    try {
      const res = await getNoteDetail(selectedCategory, filename);
      const data = await res.json();
      setSelectedNote({ filename: data.filename, content: data.content, category: data.category });
      setDynamicEchoes(null); // reset on new note
    } catch (err) {
      console.error('Failed to fetch note details', err)
    }
  }

  // handleSelectSourceFile moved to hook

  // Auto-save effect
  useEffect(() => {
    if (!selectedNote || isSaving) return;

    // We no longer debounce here. NoteEditor.tsx controls the frequency of updates 
    // to selectedNote.content, so when it changes, we want to save immediately.
    const saveNote = async () => {
      setIsSaving(true);
      try {
        await updateNoteContent(selectedNote.category, selectedNote.filename, selectedNote.content);
        // Optimization: Skip GET request after auto-save.
        // Note UI in sidebar will update on next manual fetch or category switch.
        if (selectedCategory === selectedNote.category) {
          setCategoryNotes(prev => prev.map(n =>
            n.filename === selectedNote.filename
              ? { ...n, content: selectedNote.content }
              : n
          ));
        }
      } catch {
        setStatusMessage('Network Error saving.');
      } finally {
        setTimeout(() => setIsSaving(false), 500); // Small delay to make it visible
      }
    };

    saveNote();
  }, [selectedNote?.content, selectedNote?.filename, selectedNote?.category]);

  const handleNoteOperationComplete = async (refreshCategory?: string) => {
    setSelectedNote(null);
    await fetchTaxonomy();
    if (refreshCategory && refreshCategory === selectedCategory) {
      await handleSelectCategory(refreshCategory);
    }
    await fetchCompletedNotes();
  };

  const fetchCompletedNotes = async () => {
    try {
      const res = await getTaxonomies();
      const cats = await res.json();
      const done: Array<{ filename: string; category: string; doneAt: string }> = [];
      for (const cat of cats) {
        const notesRes = await getCategoryNotes(cat.name);
        if (!notesRes.ok) continue;
        const notes = await notesRes.json();
        for (const n of notes) {
          const detailRes = await getNoteDetail(cat.name, n.filename);
          if (!detailRes.ok) continue;
          const detail = await detailRes.json();
          const content: string = detail.content || '';
          if (/tags:[\s\S]*?- done/.test(content)) {
            const doneAtMatch = content.match(/done_at:\s*"?([^"\n]+)"?/);
            done.push({ filename: n.filename, category: cat.name, doneAt: doneAtMatch?.[1] || '' });
          }
        }
      }
      done.sort((a, b) => b.doneAt.localeCompare(a.doneAt));
      setCompletedNotes(done);
    } catch (err) {
      console.error('Failed to fetch completed notes', err);
    }
  }

  const handleGenerateEchoes = async () => {
    if (!selectedNote) return;
    setIsGeneratingEchoes(true);
    setStatusMessage('Synthesizing memory echoes...');
    try {
      const res = await synthesizeEchoes(selectedNote.content, selectedNote.filename);
      const data = await res.json();
      setDynamicEchoes(data.echoes);
      setStatusMessage('');
    } catch (err) {
      console.error(err);
      setStatusMessage('Error synthesizing echoes.');
    } finally {
      setIsGeneratingEchoes(false);
    }
  }



  // --- DRAG AND DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, filename: string, sourceCategory: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ filename, sourceCategory }))
    e.currentTarget.classList.add('dragging')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over')
  }

  const handleDrop = async (e: React.DragEvent, targetCategory: string) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (data.sourceCategory === targetCategory) return // Dropped in same folder

      await moveNote(data.sourceCategory, data.filename, targetCategory);

      // Refresh view
      await fetchTaxonomy()
      if (selectedCategory) {
        await handleSelectCategory(selectedCategory)
      }
      if (selectedNote && selectedNote.filename === data.filename) {
        setSelectedNote((prev: SelectedNote | null) => prev ? { ...prev, category: targetCategory } : null)
      }

    } catch (err) {
      console.error('Drop error', err)
      showToast('Failed to move note.')
    }
  }

  const handleSaveConversation = async () => {
    if (ambientChatHistory.length === 0) return;
    setStatusMessage('Saving conversation...');

    let transcript = '';
    for (const msg of ambientChatHistory) {
      if (msg.role === 'user') {
        transcript += `**User:** ${msg.content}\n\n`;
      } else {
        transcript += `**AI:** ${msg.content}\n\n`;
      }
    }

    try {
      await saveConversation(transcript);
      setStatusMessage('Conversation saved securely.');
      await fetchTaxonomy();
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Network error saving conversation.');
    }
  }

  const handleAmbientChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ambientInput.trim()) return;

    const userMessage = ambientInput;
    setAmbientInput('');
    setIsAmbientTyping(true);

    const newHistory: ChatTurn[] = [...ambientChatHistory, { role: 'user', content: userMessage }];
    setAmbientChatHistory(newHistory);

    try {
      const response = await submitChat(userMessage, ambientChatHistory);
      const data = await response.json();
      const aiReply = data.reply;
      const flags: string[] = data.flags || [];

      // Apply Tone Prefix based on content
      let finalReply = aiReply;
      const replyLower = aiReply.toLowerCase();
      if (replyLower.includes('flight') || replyLower.includes('travel') || replyLower.includes('trip')) {
        finalReply = `✈️ ${finalReply}`;
      } else if (replyLower.includes('task') || replyLower.includes('remember') || replyLower.includes('don\'t forget')) {
        finalReply = `✅ ${finalReply}`;
      }

      setAmbientChatHistory(prev => [...prev, { role: 'assistant', content: finalReply }]);

      // Display Toasts
      if (flags.length > 0) {
        flags.forEach((flag, idx) => {
          setTimeout(() => {
            const newToastId = Date.now().toString() + idx;
            setToastFlags(prev => [...prev, { id: newToastId, message: flag }]);

            // Auto-dismiss after 8 seconds
            setTimeout(() => {
              setToastFlags(prev => prev.filter(t => t.id !== newToastId));
            }, 8000);
          }, idx * 500); // Stagger slightly
        });
      }
    } catch {
      setAmbientChatHistory(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting to your vault right now." }]);
    } finally {
      setIsAmbientTyping(false);
      // Auto-scroll
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddText.trim()) return;

    try {
      await captureRawText(quickAddText);
      setQuickAddText('');
      setIsQuickAddOpen(false);
      await fetchTaxonomy();
    } catch (err) {
      console.error('Failed quick add', err);
    }
  }



  return (
    <div className="app-container">

      {/* --- SIDEBAR --- */}
      <Sidebar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSearching={isSearching}
        searchResults={searchResults}
        taxonomies={taxonomies}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        handleSelectCategory={handleSelectCategory}
        isRenaming={isRenaming}
        setIsRenaming={setIsRenaming}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        handleRename={handleRename}
        categoryNotes={categoryNotes}
        selectedNote={selectedNote}
        setSelectedNote={setSelectedNote}
        handleSelectNote={handleSelectNote}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleDragStart={handleDragStart}
        isCompletedExpanded={isCompletedExpanded}
        setIsCompletedExpanded={setIsCompletedExpanded}
        completedNotes={completedNotes}
        fetchCompletedNotes={fetchCompletedNotes}
      />

      {/* --- MAIN CONTENT --- */}
      <main className="main-content">

        {/* Top Navbar */}
        <header className="top-nav">
          <div className="nav-breadcrumbs">
            <span className="breadcrumb-path">vault</span> / <span className="breadcrumb-current">{selectedNote ? selectedNote.category.toLowerCase().replace(/_/g, ' ') : 'new entry'}</span>
          </div>
          <div className="nav-actions">
            <button className="icon-btn theme-toggle" onClick={() => setIsSettingsOpen(true)} title="Vault Config">⚙️</button>
            <button className="icon-btn" title="View Grid">⊞</button>
            <button className="icon-btn" onClick={() => setSelectedNote(null)} title="Home">⌂</button>
          </div>
        </header>

        {/* MORNING BRIEFING BANNER */}
        {isBriefingVisible && !selectedNote && (
          <div className={`morning-briefing-wrapper ${isBriefingExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="briefing-bar" onClick={() => setIsBriefingExpanded(!isBriefingExpanded)}>
              <div className="briefing-bar-left">
                <span className="sparkle-icon">{isLoadingBriefing ? '🪄' : '✨'}</span>
                <span className="briefing-title">
                  {isLoadingBriefing ? 'Synthesizing your morning...' : `Good morning — ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                </span>
              </div>
              <div className="briefing-bar-right">
                <div className="briefing-summary-pills">
                  {briefingData?.tasks && briefingData.tasks.length > 0 && (
                    <span className="summary-pill">{briefingData.tasks.length} {briefingData.tasks.length === 1 ? 'task' : 'tasks'}</span>
                  )}
                  {briefingData?.patterns && <span className="summary-pill">Insight</span>}
                </div>
                <div className="briefing-controls">
                  <span className="chevron-icon">{isBriefingExpanded ? '▴' : '▾'}</span>
                  <button className="icon-btn dismiss-btn" onClick={(e) => { e.stopPropagation(); handleDismissBriefing(); }}>✕</button>
                </div>
              </div>
            </div>
            {isBriefingExpanded && briefingData && (
              <div className="briefing-expansion-content">
                <div className="briefing-content">
                  <div className="briefing-section">
                    <h4 className="section-title">Tasks & Reminders</h4>
                    <ul className="briefing-checklist">
                      {briefingData.tasks.map((task: string, i: number) => <li key={i}><span className="check-icon">✓</span> {task}</li>)}
                    </ul>
                  </div>
                  <div className="briefing-section">
                    <h4 className="section-title">Patterns</h4>
                    <p className="patterns-prose">{briefingData.patterns}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`center-container ${selectedNote ? 'three-column-mode' : ''}`}>
          {selectedNote ? (
            /* --- NOTE EDITOR --- */
            <NoteEditor
              note={selectedNote}
              taxonomies={taxonomies}
              isSaving={isSaving}
              actions={{
                onClose: () => {
                  if (preNoteState.current) {
                    setCaptureMode(preNoteState.current.captureMode);
                    setChatHistory(preNoteState.current.chatHistory);
                    preNoteState.current = null;
                  }
                  setSelectedNote(null);
                },
                onUpdateContent: (newContent) => setSelectedNote({ ...selectedNote, content: newContent }),
                onNoteDeleted: () => handleNoteOperationComplete(selectedNote.category),
                onNoteMoved: () => handleNoteOperationComplete(selectedNote.category),
                onOpenSettings: () => setIsSettingsOpen(true),
                showToast,
                setStatusMessage
              }}
            />
          ) : (
            <CaptureView
              selectedCategory={selectedCategory}
              handleSelectCategory={handleSelectCategory}
              fetchTaxonomy={fetchTaxonomy}
              handleSelectSourceFile={handleTimelineNoteClick}
              captureMode={captureMode}
              setCaptureMode={setCaptureMode}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
              isQuerying={isQuerying}
              setIsQuerying={setIsQuerying}
            />
          )}
        </div>
        {statusMessage && <div className="status-message">{statusMessage}</div>}
      </main>

      {/* --- RIGHT PANEL (Phase 3b) --- */}
      {selectedNote && (
        <aside className="editor-right-panel">
          <div className="right-panel-header">
            <span className="sparkle-icon" style={{ color: 'var(--c-ai-accent)' }}>✨</span>
            <h4>MEMORY ECHOES</h4>
          </div>
          <div className="right-panel-content">
            {isGeneratingEchoes ? (
              <div className="echoes-skeleton-state">
                <div className="echo-card skeleton"></div>
                <div className="echo-card skeleton" style={{ animationDelay: '0.15s' }}></div>
                <div className="echo-card skeleton" style={{ animationDelay: '0.3s' }}></div>
                <button className="btn btn-echoes" disabled style={{ opacity: 0.5 }}>
                  <span className="material-icons spin" style={{ fontSize: '16px' }}>sync</span>
                  Synthesizing...
                </button>
              </div>
            ) : !dynamicEchoes ? (
              <div className="echoes-empty-state">
                <p className="echoes-prompt">Synthesize related memories across your vault.</p>
                <button
                  className="btn btn-echoes"
                  onClick={handleGenerateEchoes}
                >
                  <span className="material-icons" style={{ fontSize: '16px' }}>auto_awesome</span>
                  Synthesize Echoes
                </button>
              </div>
            ) : (
              <div className="echoes-list-ui">
                {dynamicEchoes.map((line, i) => (
                  <div key={i} className="echo-card">
                    <div className="echo-card-label">Echo</div>
                    <div className="echo-card-text">{line.replace(/^- /, '')}</div>
                  </div>
                ))}
                <button
                  className="btn btn-echoes"
                  onClick={handleGenerateEchoes}
                >
                  <span className="material-icons" style={{ fontSize: '16px' }}>refresh</span>
                  Refresh Echoes
                </button>
              </div>
            )}

          </div>
        </aside>
      )
      }

      {/* --- AMBIENT ASSISTANT PANEL --- */}
      {
        isChatPanelOpen && (
          <aside className="ambient-chat-panel">
            <div className="chat-panel-header">
              <h3><span className="sparkle">✨</span> Ambient Assistant</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="icon-btn" onClick={handleSaveConversation} title="Save this conversation">💾</button>
                {selectedNote && (
                  <button
                    className="icon-btn"
                    onClick={handleGenerateEchoes}
                    disabled={isGeneratingEchoes}
                    title="Synthesize Echoes for current note"
                  >
                    {isGeneratingEchoes ? '⏳' : '✨'}
                  </button>
                )}
                <button className="close-btn" onClick={() => setIsChatPanelOpen(false)}>✕</button>
              </div>
            </div>

            <div className="assistant-content">
              {dynamicEchoes && dynamicEchoes.length > 0 && (
                <div className="assistant-section">
                  <div className="assistant-section-title">✨ Dynamic Synthesis</div>
                  <div className="ai-echoes-panel pulse-enter" style={{ marginTop: '8px' }}>
                    <ul className="echoes-list" style={{ paddingLeft: '20px', margin: 0 }}>
                      {dynamicEchoes.map((line, i) => (
                        <li key={i} style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{line.replace(/^- /, '')}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="assistant-section">
                <div className="assistant-section-title">🌙 Sleep Science</div>
                <div className="assistant-card">
                  <div className="assistant-card-title">New study on REM cycles</div>
                  <div className="assistant-card-text">
                    A recent paper suggests REM phases are 15% shorter when exposed to blue light.
                  </div>
                  <a href="#" className="assistant-card-link">View paper →</a>
                </div>
              </div>

              <div className="assistant-section">
                <div className="assistant-section-title">✈️ Travel</div>
                <div className="assistant-card">
                  <div className="assistant-card-title">IATA Battery Rules updated</div>
                  <div className="assistant-card-text">
                    Lithium-ion batteries over 100Wh now require prior airline approval.
                  </div>
                </div>
              </div>

              {ambientChatHistory.length > 0 && (
                <div className="assistant-section">
                  <div className="assistant-section-title">💬 Conversation</div>
                  {ambientChatHistory.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
                      <div className="bubble-content">{msg.content}</div>
                    </div>
                  ))}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-panel-input-area" onSubmit={handleAmbientChatSubmit}>
              <div className="input-wrapper">
                <input
                  type="text"
                  placeholder="Ask assistant..."
                  value={ambientInput}
                  onChange={e => setAmbientInput(e.target.value)}
                />
                <button type="submit" disabled={!ambientInput.trim() || isAmbientTyping}>
                  <span className="material-icons">send</span>
                </button>
              </div>
            </form>
          </aside>
        )
      }

      {/* --- GLOBAL UI --- */}
      {
        !isChatPanelOpen && (
          <button className="chat-toggle-btn" onClick={() => setIsChatPanelOpen(true)}>💬</button>
        )
      }

      <div className="toast-container">
        {toastFlags.map((toast) => (
          <div key={toast.id} className="toast-flag">
            <div className="toast-content">
              {toast.message.split(/(\[[^\]]+\]\([^)]+\))/g).map((part: string, i: number) => {
                const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                return linkMatch
                  ? <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="toast-link">{linkMatch[1]}</a>
                  : <span key={i}>{part}</span>;
              })}
            </div>
            <button className="toast-close" onClick={() => setToastFlags(prev => prev.filter(t => t.id !== toast.id))}>✕</button>
          </div>
        ))}
      </div>

      {
        isSettingsOpen && (
          <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Vault Configuration</h2>
                <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
              </div>
              <div className="modal-body">
                <fieldset className="settings-fieldset">
                  <legend className="settings-legend">Local Vault Path</legend>
                  <p>Absolute path to your Markdown vault directory.</p>
                  <input
                    className="setting-input font-mono"
                    value={vaultPath}
                    onChange={(e) => setVaultPath(e.target.value)}
                    placeholder="/Users/username/Vault"
                  />
                </fieldset>

                <fieldset className="settings-fieldset" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  <legend className="settings-legend" style={{ color: '#ef4444' }}>Danger Zone</legend>
                  <p>Permanently delete all notes across all taxonomies.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="setting-input font-mono"
                      placeholder="Type 'delete' to confirm"
                      value={clearConfirmText}
                      onChange={(e) => setClearConfirmText(e.target.value)}
                    />
                    <button className="btn btn-warning" onClick={() => {
                      if (!isClearConfirming) {
                        setIsClearConfirming(true);
                      } else {
                        handleClearVault();
                      }
                    }} disabled={isClearing}>
                      {isClearing ? 'Clearing...' : (isClearConfirming ? 'Confirm Clear?' : 'Clear Vault')}
                    </button>
                    {isClearConfirming && (
                      <button className="btn btn-outline" style={{ marginLeft: '8px' }} onClick={() => setIsClearConfirming(false)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </fieldset>
              </div>
              <div className="modal-footer">
                <button className="btn btn-save" onClick={handleSaveConfig}>Save Changes</button>
              </div>
            </div>
          </div>
        )
      }

      <div className="fab-container">
        {isQuickAddOpen && (
          <div className="quick-add-popover" style={{ position: 'absolute', bottom: '80px', right: '0', background: 'var(--c-sidebar)', border: '1px solid var(--c-border)', padding: '16px', borderRadius: '12px', boxShadow: '0 8px 30px var(--shadow-color)', width: '240px' }}>
            <form onSubmit={handleQuickAddSubmit}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem' }}>Quick Capture</h4>
              <textarea
                className="capture-textarea"
                style={{ minHeight: '60px', padding: '12px', fontSize: '0.9rem', marginBottom: '12px' }}
                placeholder="What's the thought?"
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                autoFocus
              />
              <button type="submit" className="commit-btn" style={{ width: '100%' }}>Add to Vault</button>
            </form>
          </div>
        )}
        <button className="fab-button" onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}>{isQuickAddOpen ? '✕' : '+'}</button>
      </div>

    </div >
  )
}

export default App
