import { useState, useEffect, useRef, useLayoutEffect, type ReactElement } from 'react';
import type { FormEvent } from 'react';
import './App.css'
import TimelineTableToggle from './components/TimelineTableToggle';
import type { ValidationDetails, SelectedNote, CaptureQueueItem, ChatMessage, TripBriefing, ChatTurn, ToastFlag, MorningBriefing } from './types/index';
import { Sidebar } from './components/layout/Sidebar';
import { NoteEditor } from './components/editor/NoteEditor';
import { useTaxonomy } from './hooks/useTaxonomy';

// --- HELPERS ---


// Parses [TABLE] and [SOURCES] blocks from query summary into React elements
const parseQuerySummary = (
  text: string,
  onSourceClick: (f: string) => void
): ReactElement => {
  if (!text) return <></>;

  const elements: ReactElement[] = [];
  // Split on [TIMELINE]...[/TIMELINE], [TABLE]...[/TABLE], and [SOURCES]...[/SOURCES]
  const parts = text.split(/(\[TIMELINE\][\s\S]*?\[\/TIMELINE\]|\[TABLE\][\s\S]*?\[\/TABLE\]|\[SOURCES\][\s\S]*?\[\/SOURCES\])/g);

  parts.forEach((part, i) => {
    if (part.startsWith('[TABLE]') && part.endsWith('[/TABLE]')) {
      const inner = part.slice(7, -8).trim();
      const lines = inner.split('\n').filter(l => l.trim().startsWith('|'));
      if (lines.length < 2) { elements.push(<p key={i}>{inner}</p>); return; }

      const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
      const rows = lines.slice(2).map(l => l.split('|').map(c => c.trim()).filter(Boolean));
      const sourceColIdx = headers.findIndex(h => h.toLowerCase().includes('source'));

      elements.push(
        <div key={i} className="query-table-wrapper">
          <table className="query-table">
            <thead>
              <tr>{headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>
                      {ci === sourceColIdx && cell && cell !== '—' ? (
                        <button className="source-link-btn" onClick={() => onSourceClick(cell)}>
                          📄 {cell}
                        </button>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div >
      );
    } else if (part.startsWith('[TIMELINE]') && part.endsWith('[/TIMELINE]')) {
      const inner = part.slice(10, -11).trim();
      const lines = inner.split('\n').filter(l => l.trim().startsWith('|'));
      if (lines.length < 2) { elements.push(<p key={i}>{inner}</p>); return; }

      const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
      const rows = lines.slice(2).map(l => l.split('|').map(c => c.trim()).filter(Boolean));
      const sourceColIdx = headers.findIndex(h => h.toLowerCase().includes('source'));

      elements.push(
        <TimelineTableToggle
          key={i}
          headers={headers}
          rows={rows}
          sourceColIdx={sourceColIdx}
          onSourceClick={onSourceClick}
          defaultView="timeline"
        />
      );
    } else if (part.startsWith('[SOURCES]') && part.endsWith('[/SOURCES]')) {
      const inner = part.slice(9, -10).trim();
      const files = inner.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(f => f && f !== 'No notes found.');
      if (files.length === 0) return;
      elements.push(
        <div key={i} className="query-sources">
          <div className="sources-label">📚 Sources referenced</div>
          {files.map((f, fi) => (
            <button key={fi} className="source-link-btn" onClick={() => onSourceClick(f)}>
              📄 {f}
            </button>
          ))}
        </div>
      );
    } else if (part.trim()) {
      // Plain text — split on ### headings for light formatting
      const textParts = part.split(/(###[^\n]+)/g);
      textParts.forEach((tp, ti) => {
        if (tp.startsWith('###')) {
          elements.push(<h4 key={`${i}-${ti}`} className="query-section-heading">{tp.replace('###', '').trim()}</h4>);
        } else if (tp.trim()) {
          // Add line breaks before bullet points (- ) for better readability
          let formattedText = tp;
          formattedText = formattedText.replace(/(?<!^)( - )/g, '\n\n- ');
          formattedText = formattedText.replace(/\n- /g, '\n\n- ');

          // Convert any bare Category/Filename.md references into clickable links
          const linkParts = formattedText.split(/\b([A-Z][a-zA-Z_]+\/[^\s,|]+\.md)\b/g);
          elements.push(
            <p key={`${i}-${ti}`} style={{ whiteSpace: 'pre-wrap' }}>
              {linkParts.map((lp, li) =>
                lp.match(/^[A-Z][a-zA-Z_]+\/[^\s,|]+\.md$/) ? (
                  <button key={li} className="source-link-btn inline" onClick={() => onSourceClick(lp)}>📄 {lp}</button>
                ) : lp
              )}
            </p>
          );
        }
      });
    }
  });

  return <>{elements}</>;
};

// Variables moved to session storage

function App() {
  const [inputText, setInputText] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [captureDateTime, setCaptureDateTime] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });


  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5177';



  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [lastCaptureDetails, setLastCaptureDetails] = useState<ValidationDetails | null>(null)

  // Editor State
  const [selectedNote, setSelectedNote] = useState<SelectedNote | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // File input refs
  const captureFileInputRef = useRef<HTMLInputElement>(null)

  // Form State
  const [selectedDestCategory, setSelectedDestCategory] = useState<string>('')

  const [captureMode, setCaptureMode] = useState<'capture' | 'query'>('capture')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const [captureQueue, setCaptureQueue] = useState<CaptureQueueItem[]>([])

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

  // Trip Briefing State
  const [isTripBriefingOpen, setIsTripBriefingOpen] = useState(false)
  const [tripDestination, setTripDestination] = useState('')
  const [tripDate, setTripDate] = useState('')
  const [isGeneratingTripContext, setIsGeneratingTripContext] = useState(false)

  const tripAnchorRef = useRef<HTMLDivElement>(null);
  const tripPopoverRef = useRef<HTMLDivElement>(null);
  const [tripPopoverStyle, setTripPopoverStyle] = useState<React.CSSProperties>({});
  const [tripPopoverDirection, setTripPopoverDirection] = useState<'up' | 'down'>('up');
  const [isTripTight, setIsTripTight] = useState(false);

  useLayoutEffect(() => {
    if (isTripBriefingOpen && tripAnchorRef.current) {
      const anchorRect = tripAnchorRef.current.getBoundingClientRect();
      const spaceAbove = anchorRect.top;
      const spaceBelow = window.innerHeight - anchorRect.bottom;

      const direction = spaceAbove > spaceBelow ? 'up' : 'down';
      setTripPopoverDirection(direction);

      const availableSpace = direction === 'up' ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(availableSpace - 32, 180);
      setIsTripTight(maxHeight < 250);

      const style: React.CSSProperties = {
        maxHeight: `${maxHeight}px`,
        width: '280px',
      };

      if (direction === 'up') {
        style.bottom = 'calc(100% + 12px)';
        style.top = 'auto';
      } else {
        style.top = 'calc(100% + 12px)';
        style.bottom = 'auto';
      }

      setTripPopoverStyle(style);
    }
  }, [isTripBriefingOpen]);

  // Ambient Contextual Chat State
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false)
  const [ambientChatHistory, setAmbientChatHistory] = useState<ChatTurn[]>([])
  const [ambientInput, setAmbientInput] = useState('')
  const [isAmbientTyping, setIsAmbientTyping] = useState(false)
  const [toastFlags, setToastFlags] = useState<ToastFlag[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Taxonomies State (Hook)
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
    API_BASE_URL,
    setSelectedNote,
    setToastFlags,
    setDynamicEchoes
  });

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
      const res = await fetch(`${API_BASE_URL}/api/briefing`);
      if (res.ok) {
        const data = await res.json();
        setBriefingData(data);
        setIsBriefingVisible(true);
      }
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
      if (isTripBriefingOpen) { setIsTripBriefingOpen(false); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNote, isSettingsOpen, isChatPanelOpen, isTripBriefingOpen]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config/vault`)
      if (res.ok) {
        const data = await res.json()
        setVaultPath(data.vaultPath)
      }
    } catch (err) {
      console.error('Failed to fetch config', err)
    }
  }

  const handleSaveConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath })
      });
      if (res.ok) {
        showToast('Vault path saved. The backend is tracking this directory.');
        setIsSettingsOpen(false);
        fetchTaxonomy();
      } else {
        showToast('Failed to save config.');
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleClearVault = async () => {
    if (clearConfirmText.toLowerCase() !== 'delete') return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/config/vault/clear`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Vault cleared successfully.');
        setIsClearing(false);
        setClearConfirmText('');
        setIsClearConfirming(false);
        setIsSettingsOpen(false);
        setSelectedNote(null);
        setSelectedCategory(null);
        fetchTaxonomy();
      } else {
        const err = await res.text();
        showToast('Failed to clear vault: ' + err);
      }
    } catch (err) {
      console.error(err);
      showToast('Network error clearing vault.');
    }
  }

  // Full-text search and Queue Processing Effects


  // Queue Processing Effect
  useEffect(() => {
    const processQueueItem = async (item: CaptureQueueItem) => {
      setCaptureQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        let response;
        if (item.file) {
          const formData = new FormData();
          formData.append('file', item.file);
          if (item.text) formData.append('description', item.text);
          if (item.category) formData.append('category', item.category);

          response = await fetch(`${API_BASE_URL}/api/capture/upload`, {
            method: 'POST',
            body: formData,
          });
        } else {
          const payload = item.category ? `${item.category}\n${item.text}` : item.text;
          response = await fetch(`${API_BASE_URL}/api/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_text: payload }),
          });
        }

        if (response.ok) {
          const result = await response.json();
          setCaptureQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'done', result: result.details } : i));
          setLastCaptureDetails(result.details);
          await fetchTaxonomy();
          if (selectedCategory) {
            await handleSelectCategory(selectedCategory);
          }
        } else {
          const err = await response.text();
          setCaptureQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: err } : i));
        }
      } catch {
        setCaptureQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: 'Network error.' } : i));
      }
    };

    const pendingItem = captureQueue.find(item => item.status === 'pending');
    const isProcessing = captureQueue.some(item => item.status === 'processing');

    if (pendingItem && !isProcessing) {
      processQueueItem(pendingItem);
    }
  }, [captureQueue, selectedCategory]);

  const removeQueueItem = (id: string) => {
    setCaptureQueue(q => q.filter(i => i.id !== id));
  }

  const handleQuickAction = (template: string) => {
    setInputText(template);
    const textarea = document.querySelector('.capture-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  }

  // handleSelectCategory moved to hook

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue === oldName) {
      setIsRenaming(null)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${oldName}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ new_name: renameValue }),
      })
      if (res.ok) {
        setIsRenaming(null)
        if (selectedCategory === oldName) {
          setSelectedCategory(renameValue)
        }
        await fetchTaxonomy()
      } else {
        showToast('Failed to rename')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSelectNote = async (filename: string) => {
    if (!selectedCategory) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedCategory}/notes/${filename}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedNote({ filename: data.filename, content: data.content, category: data.category })
        setDynamicEchoes(null) // reset on new note
      }
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
        const res = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes/${selectedNote.filename}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: selectedNote.content })
        });
        if (res.ok) {
          // Refresh preview list without closing the note if we are in the same category
          const catRes = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes`);
          if (catRes.ok) {
            const data = await catRes.json();
            if (selectedCategory === selectedNote.category) {
              setCategoryNotes(data);
            }
          }
        } else {
          setStatusMessage('Failed to auto-save.');
        }
      } catch {
        setStatusMessage('Network Error saving.');
      } finally {
        setTimeout(() => setIsSaving(false), 500); // Small delay to make it visible
      }
    };

    saveNote();
  }, [selectedNote?.content, selectedNote?.filename, selectedNote?.category, API_BASE_URL]);

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
      const res = await fetch(`${API_BASE_URL}/api/taxonomy`);
      if (!res.ok) return;
      const cats = await res.json();
      const done: Array<{ filename: string; category: string; doneAt: string }> = [];
      for (const cat of cats) {
        const notesRes = await fetch(`${API_BASE_URL}/api/taxonomy/${cat.name}/notes`);
        if (!notesRes.ok) continue;
        const notes = await notesRes.json();
        for (const n of notes) {
          const detailRes = await fetch(`${API_BASE_URL}/api/taxonomy/${cat.name}/notes/${n.filename}`);
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

  // Paste handler for capture textarea
  const handleCapturePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData.files;
    if (files && files.length > 0) {
      e.preventDefault();
      setSelectedFile(files[0]);
    }
  };

  const handleGenerateEchoes = async () => {
    if (!selectedNote) return;
    setIsGeneratingEchoes(true);
    setStatusMessage('Synthesizing memory echoes...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/insights/echoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: selectedNote.content, excludeFilename: selectedNote.filename })
      });
      if (res.ok) {
        const data = await res.json();
        setDynamicEchoes(data);
        setStatusMessage('');
      } else {
        setStatusMessage('Error synthesizing echoes.');
      }
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

      await fetch(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(data.sourceCategory)}/notes/${encodeURIComponent(data.filename)}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_category: targetCategory })
      })

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
    if (chatHistory.length === 0) return;
    setStatusMessage('Saving conversation...');

    // Format full transcript
    let transcript = '';
    for (const msg of chatHistory) {
      if (msg.role === 'user') {
        transcript += `**User:** ${msg.content}\n\n`;
      } else {
        transcript += `**AI:** ${msg.summary}\n\n`;
        if (msg.timeline && msg.timeline.length > 0) {
          transcript += `*Timeline:*\n`;
          msg.timeline.forEach((t: { date: string, event: string, source_file?: string }) => {
            transcript += `- **${t.date}**: ${t.event}\n`;
          });
          transcript += `\n`;
        }
      }
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/capture/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: transcript }),
      });

      if (response.ok) {
        setStatusMessage('Conversation saved securely.');
        await fetchTaxonomy();
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setStatusMessage('Failed to save conversation.');
      }
    } catch {
      setStatusMessage('Network error saving conversation.');
    }
  }

  const handleTripBriefingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tripDestination.trim()) return;

    setIsGeneratingTripContext(true);
    setCaptureMode('query'); // ensure query view is active to show results
    setIsTripBriefingOpen(false);

    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: `Generate trip briefing for ${tripDestination} ${tripDate ? 'on ' + tripDate : ''} ` }];
    setChatHistory(newHistory);

    try {
      const response = await fetch(`${API_BASE_URL}/api/tripcontext`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: tripDestination, date: tripDate }),
      });

      if (response.ok) {
        const result: TripBriefing = await response.json();

        let summaryHtml = '';
        if (result.tasks && result.tasks.length > 0) summaryHtml += `<h4>✅ Tasks & Reminders</h4 > <ul>${result.tasks.map((t: string) => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.pastExperiences && result.pastExperiences.length > 0) summaryHtml += `<h4>📍 Past Experiences</h4 > <ul>${result.pastExperiences.map((t: string) => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.people && result.people.length > 0) summaryHtml += `<h4>👤 People & Connections</h4 > <ul>${result.people.map((t: string) => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.prepare && result.prepare.length > 0) summaryHtml += `<h4>🎒 Bring or Prepare</h4 > <ul>${result.prepare.map((t: string) => '<li>' + t + '</li>').join('')}</ul>`;

        if (!summaryHtml) summaryHtml = "<p>No notable insights found for this destination.</p>";

        setChatHistory((prev: ChatMessage[]) => [...prev, { role: 'assistant', content: '', summary: summaryHtml }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: 'Error generating trip briefing.' }]);
      }
    } catch {
      setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: 'Network error.' }]);
    } finally {
      setIsGeneratingTripContext(false);
      setTripDestination('');
      setTripDate('');
    }
  }

  const handleAmbientChatSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ambientInput.trim()) return;

    const userMessage = ambientInput;
    setAmbientInput('');
    setIsAmbientTyping(true);

    const newHistory: ChatTurn[] = [...ambientChatHistory, { role: 'user', content: userMessage }];
    setAmbientChatHistory(newHistory);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversationHistory: ambientChatHistory }),
      });

      if (response.ok) {
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
      } else {
        setAmbientChatHistory(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting to your vault right now." }]);
      }
    } catch {
      setAmbientChatHistory(prev => [...prev, { role: 'assistant', content: "Network error occurred." }]);
    } finally {
      setIsAmbientTyping(false);
      // Auto-scroll
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  const handleSubmitCapture = async (e: FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() && !selectedFile) return

    if (captureMode === 'query') {
      if (!inputText.trim()) return // Query mode still requires text
      setIsQuerying(true)

      const userMessage = inputText;
      const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: userMessage }];
      setChatHistory(newHistory);
      setInputText('') // Clear input immediately

      const isTemporal = /week|past|trend|pattern|average|history|how has|over time/i.test(userMessage);

      try {
        const payload = newHistory.map(msg => ({
          role: msg.role,
          content: msg.role === 'user' ? msg.content : msg.summary
        }));

        const response = await fetch(`${API_BASE_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payload, mode: isTemporal ? 'temporal' : 'standard' }),
        })

        if (response.ok) {
          const result = await response.json()
          setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: result.summary, trend: result.trend }]);
        } else {
          setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: 'Error: Could not reach knowledge vault.' }]);
        }
      } catch {
        setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: 'Network error communicating with the vault API.' }]);
      } finally {
        setIsQuerying(false)
      }
      return
    }

    // Capture Mode - Add to Queue
    const [datePart, timePart] = captureDateTime.split('T');
    const [year, month, day] = datePart.split('-');
    const formattedDateTime = `${day}-${month}-${year} ${timePart}`;
    const timestampPrefix = `[${formattedDateTime}] `;

    const newItem: CaptureQueueItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: timestampPrefix + inputText,
      category: selectedDestCategory,
      status: 'pending',
      file: selectedFile || undefined
    };

    setCaptureQueue(prev => [...prev, newItem]);
    setInputText(''); // Instantly clear for next thought
    setSelectedFile(null); // Clear attached file
    setStatusMessage(''); // Clear any generic message

    // Reset to current time
    const now = new Date();
    setCaptureDateTime(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  }

  const handleQuickAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickAddText.trim()) return;

    const newItem: CaptureQueueItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: quickAddText,
      category: selectedDestCategory,
      status: 'pending'
    };

    setCaptureQueue(prev => [...prev, newItem]);
    setQuickAddText('');
    setIsQuickAddOpen(false);
  }



  return (
    <div className="app-container">

      {/* --- SIDEBAR --- */}
      <Sidebar
        API_BASE_URL={API_BASE_URL}
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
              API_BASE_URL={API_BASE_URL}
              isSaving={isSaving}
              actions={{
                onClose: () => setSelectedNote(null),
                onUpdateContent: (newContent) => setSelectedNote({ ...selectedNote, content: newContent }),
                onNoteDeleted: () => handleNoteOperationComplete(selectedNote.category),
                onNoteMoved: () => handleNoteOperationComplete(selectedNote.category),
                onOpenSettings: () => setIsSettingsOpen(true),
                showToast,
                setStatusMessage
              }}
            />
          ) : (
            /* --- CAPTURE VIEW --- */
            <div className={`capture-layout mode-${captureMode}`}>

              <div className="mode-tabs">
                <button
                  className={`mode-tab ${captureMode === 'capture' ? 'active' : ''}`}
                  onClick={() => { setCaptureMode('capture'); setChatHistory([]); setStatusMessage(''); }}
                >
                  Capture
                </button>
                <button
                  className={`mode-tab ${captureMode === 'query' ? 'active' : ''}`}
                  onClick={() => { setCaptureMode('query'); setStatusMessage(''); }}
                >
                  Query Vault
                </button>

                <div className="trip-briefing-anchor" ref={tripAnchorRef}>
                  <button
                    className={`mode-tab icon-tab ${isTripBriefingOpen ? 'active' : ''}`}
                    onClick={() => setIsTripBriefingOpen(!isTripBriefingOpen)}
                    title="Trip Briefing"
                  >
                    ✈️
                  </button>
                  {isTripBriefingOpen && (
                    <div
                      className={`trip-briefing-popover direction-${tripPopoverDirection} ${isTripTight ? 'is-tight' : ''}`}
                      ref={tripPopoverRef}
                      style={tripPopoverStyle}
                    >
                      <div className="quick-add-header">
                        <span>Trip Briefing</span>
                        <button type="button" className="close-btn" onClick={() => setIsTripBriefingOpen(false)}>✕</button>
                      </div>
                      <input
                        className="setting-input"
                        placeholder="Destination"
                        value={tripDestination}
                        onChange={e => setTripDestination(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="commit-btn"
                        disabled={!tripDestination.trim() || isGeneratingTripContext}
                        onClick={handleTripBriefingSubmit}
                      >
                        Generate
                      </button>
                      <div className="popover-arrow" />
                    </div>
                  )}
                </div>
              </div>

              <div className="capture-icon-bubble">
                <span className="stack-icon">{captureMode === 'capture' ? '📚' : '🔍'}</span>
              </div>

              <div className="capture-header">
                <h1>{captureMode === 'capture' ? 'Transfer a thought' : 'Ask your vault'}</h1>
                <p>{captureMode === 'capture' ? 'The AI engine handles the rest.' : 'Synthesize answers instantly.'}</p>
              </div>

              {/* Hidden file input for capture box */}
              <input
                type="file"
                ref={captureFileInputRef}
                style={{ display: 'none' }}
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                  e.target.value = '';
                }}
              />

              <form onSubmit={handleSubmitCapture} className="capture-form-container">
                <textarea
                  className="capture-textarea"
                  placeholder={captureMode === 'capture' ? "What's on your mind..." : "Ask a question..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onPaste={captureMode === 'capture' ? handleCapturePaste : undefined}
                  autoFocus
                />

                {/* File chip — shown when a file is attached */}
                {captureMode === 'capture' && selectedFile && (
                  <div className="capture-file-chip-row">
                    <div className="file-chip">
                      <span className="material-icons file-chip-icon">attach_file</span>
                      <span className="file-chip-name">{selectedFile.name}</span>
                      <button
                        type="button"
                        className="file-chip-remove"
                        onClick={() => setSelectedFile(null)}
                        title="Remove attachment"
                      >✕</button>
                    </div>
                  </div>
                )}

                {captureMode === 'capture' && (
                  <div className="quick-actions" style={{ padding: '0 24px 12px 24px', display: 'flex', gap: '8px' }}>
                    <button type="button" className="toolbar-pill" onClick={() => handleQuickAction('Plan for ')}>🗓️ Plan</button>
                    <button type="button" className="toolbar-pill" onClick={() => handleQuickAction('Remember to ')}>✅ Reminder</button>
                    <button type="button" className="toolbar-pill" onClick={() => handleQuickAction('Idea: ')}>💡 Idea</button>
                  </div>
                )}

                <div className="capture-form-toolbar">
                  <div className="toolbar-left">
                    {captureMode === 'capture' && (
                      <>
                        <select
                          className="toolbar-pill dest-select"
                          value={selectedDestCategory}
                          onChange={(e) => setSelectedDestCategory(e.target.value)}
                        >
                          <option value="">Auto-Route (AI)</option>
                          {taxonomies.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                        </select>
                        <button
                          type="button"
                          className="toolbar-pill attach-btn"
                          onClick={() => captureFileInputRef.current?.click()}
                          title="Attach a file"
                        >
                          <span className="material-icons" style={{ fontSize: '15px', verticalAlign: 'middle' }}>attach_file</span>
                        </button>
                      </>
                    )}
                  </div>
                  <button type="submit" className="commit-btn" disabled={isQuerying}>
                    {isQuerying ? 'THINKING...' : '➔ COMMIT'}
                  </button>
                </div>
              </form>

              {captureQueue.length > 0 && captureMode === 'capture' && (
                <div className="capture-queue list-fade">
                  {captureQueue.slice().reverse().map(item => (
                    <div key={item.id} className={`queue-item status-${item.status}`}>
                      <div className="queue-text">{item.text}</div>
                      <div className="queue-status">
                        <span className={`q-badge ${item.status}`}>{item.status}</span>
                        <button className="q-dismiss" onClick={() => removeQueueItem(item.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {captureMode === 'query' && chatHistory.length > 0 && (
                <div className="chat-log-container">
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${msg.role}`}>
                      <div className={msg.role === 'user' ? "user-msg-content" : "ai-msg-content"}>
                        {msg.role === 'assistant' && (
                          <div className="query-result-header">
                            <div className="query-result-header-left">
                              <span className="ai-icon" style={{ color: 'var(--c-ai-accent)' }}>✨</span>
                              <h4>KAE ANALYSIS</h4>
                            </div>
                          </div>
                        )}
                        {msg.role === 'assistant' && (msg.summary || msg.content)
                          ? parseQuerySummary(msg.summary || msg.content, handleSelectSourceFile)
                          : (msg.summary || msg.content)}
                        {msg.timeline && msg.timeline.length > 0 && (
                          <div className="query-timeline" style={{ marginTop: '16px' }}>
                            {msg.timeline.map((t: { date: string, event: string, source_file?: string }, i: number) => (
                              <div key={i} className="timeline-item clickable-item" onClick={() => t.source_file && handleSelectSourceFile(t.source_file)}>
                                <div className="timeline-dot"></div>
                                <div className="timeline-content">
                                  <strong>{t.date}</strong>: {t.event}
                                  {t.source_file && <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>📄 {t.source_file}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {lastCaptureDetails && (
                <div className="status-message success-badge" style={{ marginTop: '16px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '8px 16px', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  ✅ Saved to <strong>{lastCaptureDetails.targetCategory}</strong>
                </div>
              )}

              {statusMessage && <div className="status-message">{statusMessage}</div>}
            </div>
          )}
        </div>
      </main >

      {/* --- RIGHT PANEL (Phase 3b) --- */}
      {
        selectedNote && (
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
