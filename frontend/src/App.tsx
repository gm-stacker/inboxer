import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import './App.css'

interface TaxonomyCategory {
  name: string
  noteCount: number
}

interface NotePreview {
  filename: string
  preview: string
  createdAt: string
}

interface ValidationDetails {
  action: string
  targetCategory: string
  confidenceScore: number
  suggestedFilename: string
  frontmatter: {
    type: string
    tags: string[]
    extractedDate?: string
    entities: string[]
    metrics: Record<string, any>
  }
  footnotes: string[]
  updates?: any[]
  duplicates?: string[]
}

interface SelectedNote {
  filename: string
  content: string
  category: string
}

interface CaptureQueueItem {
  id: string;
  text: string;
  category: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: any;
  error?: string;
  file?: File;
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  summary?: string
  trend?: string
  // Legacy fields (kept for backwards compatibility if needed during dev)
  timeline?: Array<{ date: string, event: string, source_file?: string }>; // for assistant
  undetermined_items?: Array<{ event: string, source_file?: string }>; // for assistent
}

interface TripBriefing {
  tasks: string[];
  pastExperiences: string[];
  people: string[];
  prepare: string[];
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ToastFlag {
  id: string;
  message: string;
}

interface MorningBriefing {
  tasks: string[];
  patterns: string;
  focus: string;
}

// --- HELPERS ---
const parseNoteContent = (content: string) => {
  if (!content) return { props: {} as Record<string, any>, body: '' };
  const parts = content.split('---');
  if (parts.length >= 3 && parts[0].trim() === '') {
    const frontmatterRaw = parts[1];
    const body = parts.slice(2).join('---').trim();
    const props: Record<string, any> = {};
    frontmatterRaw.split('\n').forEach(line => {
      const match = line.match(/^([^:]+):(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (value.startsWith('[') && value.endsWith(']')) {
          props[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));
        } else {
          props[key] = value;
        }
      }
    });
    return { props, body };
  }
  return { props: {} as Record<string, any>, body: content };
};

const joinNoteContent = (props: Record<string, any>, body: string) => {
  if (Object.keys(props).length === 0) return body;
  let yaml = '---\n';
  for (const [key, value] of Object.entries(props)) {
    if (Array.isArray(value)) {
      yaml += `${key}: [${value.join(', ')}]\n`;
    } else {
      yaml += `${key}: ${value}\n`;
    }
  }
  yaml += '---\n\n';
  return yaml + body;
};

const getDisplayTitle = (content: string, fallback: string) => {
  if (!content) return fallback.replace('.md', '').replaceAll('_', ' ');
  const { body } = parseNoteContent(content);
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      let title = trimmed.replace(/^#+\s+/, ''); // Strip Markdown headers
      title = title.replace(/^\[\d{2}-\d{2}-\d{4} \d{2}:\d{2}\]\s*/, ''); // Strip timestamp tags
      return title || fallback.replace('.md', '').replaceAll('_', ' ');
    }
  }
  return fallback.replace('.md', '').replaceAll('_', ' ');
};

// Module-level variable to persist dismissal across component re-renders
let sessionDismissedDate: string | null = null;

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


  // Taxonomies State
  const [taxonomies, setTaxonomies] = useState<TaxonomyCategory[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const activeCategoryFetchRef = useRef<string | null>(null)
  const [categoryNotes, setCategoryNotes] = useState<NotePreview[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isRenaming, setIsRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Memory Echo State
  const [lastCaptureDetails, setLastCaptureDetails] = useState<ValidationDetails | null>(null)

  // Editor State
  const [selectedNote, setSelectedNote] = useState<SelectedNote | null>(null)
  const [moveToCategory, setMoveToCategory] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingToNote, setIsUploadingToNote] = useState(false)

  // File input refs
  const captureFileInputRef = useRef<HTMLInputElement>(null)
  const noteFileInputRef = useRef<HTMLInputElement>(null)

  // Form State
  const [selectedDestCategory, setSelectedDestCategory] = useState<string>('')

  const [captureMode, setCaptureMode] = useState<'capture' | 'query'>('capture')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const [captureQueue, setCaptureQueue] = useState<CaptureQueueItem[]>([])

  // Properties Panel State
  const [isPropertiesExpanded, setIsPropertiesExpanded] = useState(false)

  // Quick-Add State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')

  // Dynamic Echoes State
  const [dynamicEchoes, setDynamicEchoes] = useState<string[] | null>(null)
  const [isGeneratingEchoes, setIsGeneratingEchoes] = useState(false)

  // Morning Briefing State
  const [briefingData, setBriefingData] = useState<MorningBriefing | null>(null)
  const [isBriefingVisible, setIsBriefingVisible] = useState(false)

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5177';

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

  // Vault Config State
  const [vaultPath, setVaultPath] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')

  const theme = 'dark' as const;

  // Fetch Taxonomy, Config, and Briefing on Load
  useEffect(() => {
    fetchConfig()
    fetchTaxonomy()

    // Check morning briefing
    const today = new Date().toISOString().split('T')[0];
    if (sessionDismissedDate !== today) {
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
    sessionDismissedDate = new Date().toISOString().split('T')[0];
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
        alert('Vault path saved. The backend is tracking this directory.');
        setIsSettingsOpen(false);
        fetchTaxonomy();
      } else {
        alert('Failed to save config.');
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
        alert('Vault cleared successfully.');
        setIsClearing(false);
        setClearConfirmText('');
        setIsSettingsOpen(false);
        setSelectedNote(null);
        setSelectedCategory(null);
        fetchTaxonomy();
      } else {
        const err = await res.text();
        alert('Failed to clear vault: ' + err);
      }
    } catch (err) {
      console.error(err);
      alert('Network error clearing vault.');
    }
  }

  const fetchTaxonomy = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy`)
      if (res.ok) {
        const data = await res.json()
        setTaxonomies(data)
      }
    } catch (err) {
      console.error('Failed to fetch taxonomy', err)
    }
  }

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

  const handleSelectCategory = async (categoryName: string) => {
    if (selectedCategory === categoryName) {
      setSelectedCategory(null)
      setCategoryNotes([])
      activeCategoryFetchRef.current = null;
      return
    }
    setSelectedCategory(categoryName)
    setCategoryNotes([])
    activeCategoryFetchRef.current = categoryName;
    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${categoryName}/notes`)
      if (res.ok) {
        const data = await res.json()
        if (activeCategoryFetchRef.current === categoryName) {
          setCategoryNotes(data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch notes', err)
    }
  }

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
        alert('Failed to rename')
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
        setIsPropertiesExpanded(false) // collapse properties on new note
      }
    } catch (err) {
      console.error('Failed to fetch note details', err)
    }
  }

  const handleSelectSourceFile = async (sourceFile: string) => {
    if (!sourceFile) return;
    const parts = sourceFile.split('/');
    if (parts.length !== 2) return;
    const categoryName = parts[0];
    const filename = parts[1];

    // Auto-select category so right sidebar knows context
    setSelectedCategory(categoryName);
    setCategoryNotes([]);
    activeCategoryFetchRef.current = categoryName;

    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${categoryName}/notes/${filename}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedNote({ filename: data.filename, content: data.content, category: data.category });
        setDynamicEchoes(null);
        setIsPropertiesExpanded(false);
      } else {
        alert(`Failed to load note: ${sourceFile}.It may have been moved or deleted.`);
        setSelectedNote(null);
      }
    } catch (err) {
      console.error('Failed to fetch source file note', err);
      alert(`Failed to load note: ${sourceFile}.Network error.`);
      setSelectedNote(null);
    }

    // Auto-load category notes to keep the sidebar in sync
    try {
      const catRes = await fetch(`${API_BASE_URL}/api/taxonomy/${categoryName}/notes`);
      if (catRes.ok) {
        const catData = await catRes.json();
        if (activeCategoryFetchRef.current === categoryName) {
          setCategoryNotes(catData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch category notes', err);
    }
  }

  // Auto-Save Effect
  useEffect(() => {
    if (!selectedNote) return;

    // Skip auto-save on initial note load
    if (!selectedNote.content) return;

    const saveTimeout = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes/${selectedNote.filename}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: selectedNote.content })
        });
        if (res.ok) {
          // Refresh preview list without closing the note
          const catRes = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes`);
          if (catRes.ok) {
            const data = await catRes.json();
            // ONLY update if we are still looking at the same category that was saved
            if (activeCategoryFetchRef.current === selectedNote.category) {
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
    }, 1500); // 1.5s debounce

    return () => clearTimeout(saveTimeout);
  }, [selectedNote?.content, selectedNote?.filename, selectedNote?.category, API_BASE_URL]);

  const handleDeleteNote = async () => {
    if (!selectedNote) return
    if (!confirm(`Are you sure you want to delete ${selectedNote.filename} ? `)) return

    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes/${selectedNote.filename}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setSelectedNote(null)
        await handleSelectCategory(selectedNote.category)
        await fetchTaxonomy()
      }
    } catch (err) {
      console.error(err)
    }
  }



  const handleMoveNote = async () => {
    if (!selectedNote || !moveToCategory) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes/${selectedNote.filename}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_category: moveToCategory })
      })
      if (res.ok) {
        setSelectedNote(null)
        await handleSelectCategory(selectedNote.category)
        await fetchTaxonomy()
      } else {
        alert('Failed to move note.')
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Upload a file into the currently open note's category, then insert ![[filename]] at cursor
  const handleNoteFileUpload = useCallback(async (file: File, cursorChunkIndex: number, cursorPos: number) => {
    if (!selectedNote) return;
    setIsUploadingToNote(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedNote.category);
      const res = await fetch(`${API_BASE_URL}/api/capture/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const embed = file.type.startsWith('image') ? `![[${file.name.replace(/ /g, '_')}]]` : `[[${file.name.replace(/ /g, '_')}]]`;
        // Insert into note content at cursor chunk
        const { props, body } = parseNoteContent(selectedNote.content);
        const chunks = body.split(/(!\[\[.*?\]\])/g);
        const chunk = chunks[cursorChunkIndex] || '';
        const newChunk = chunk.slice(0, cursorPos) + `\n${embed}\n` + chunk.slice(cursorPos);
        chunks[cursorChunkIndex] = newChunk;
        setSelectedNote({ ...selectedNote, content: joinNoteContent(props, chunks.join('')) });
      } else {
        console.error('Upload failed', await res.text());
      }
    } catch (err) {
      console.error('Upload error', err);
    } finally {
      setIsUploadingToNote(false);
    }
  }, [selectedNote, API_BASE_URL]);

  // Direct file upload to note using multipart — saves into note's category folder only
  const handleNoteFileSelect = useCallback(async (file: File) => {
    if (!selectedNote) return;
    setIsUploadingToNote(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedNote.category);
      const res = await fetch(`${API_BASE_URL}/api/capture/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const embed = file.type.startsWith('image') ? `![[${file.name.replace(/ /g, '_')}]]` : `[[${file.name.replace(/ /g, '_')}]]`;
        const { props, body } = parseNoteContent(selectedNote.content);
        setSelectedNote({ ...selectedNote, content: joinNoteContent(props, body + `\n\n${embed}\n`) });
      } else {
        console.error('Upload failed', await res.text());
      }
    } catch (err) {
      console.error('Upload error', err);
    } finally {
      setIsUploadingToNote(false);
    }
  }, [selectedNote, API_BASE_URL]);

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

  const handleReanalyze = async () => {
    if (!selectedNote) return
    setStatusMessage('Re-analyzing with AI Engine...')

    let rawText = selectedNote.content;
    if (rawText.startsWith('---')) {
      const endMatch = rawText.indexOf('\n---');
      if (endMatch !== -1) {
        rawText = rawText.substring(endMatch + 4).trim();
      }
    }

    try {
      await fetch(`${API_BASE_URL}/api/taxonomy/${selectedNote.category}/notes/${selectedNote.filename}`, {
        method: 'DELETE'
      })

      const response = await fetch(`${API_BASE_URL}/api/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      })

      if (response.ok) {
        const result = await response.json()
        setSelectedNote(null)
        setStatusMessage('Analysis complete!')
        setLastCaptureDetails(result.details)
        await fetchTaxonomy()
        if (selectedCategory) {
          await handleSelectCategory(selectedCategory)
        }
        setTimeout(() => setStatusMessage(''), 3000)
      } else {
        const err = await response.text()
        setStatusMessage('Analysis Error: ' + err)
      }
    } catch (error) {
      console.error(error)
      setStatusMessage('Network Error')
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
        setSelectedNote(prev => prev ? { ...prev, category: targetCategory } : null)
      }

    } catch (err) {
      console.error('Drop error', err)
      alert('Failed to move note.')
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
          msg.timeline.forEach(t => {
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
        if (result.tasks && result.tasks.length > 0) summaryHtml += `<h4>✅ Tasks & Reminders</h4 > <ul>${result.tasks.map(t => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.pastExperiences && result.pastExperiences.length > 0) summaryHtml += `<h4>📍 Past Experiences</h4 > <ul>${result.pastExperiences.map(t => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.people && result.people.length > 0) summaryHtml += `<h4>👤 People & Connections</h4 > <ul>${result.people.map(t => '<li>' + t + '</li>').join('')}</ul>`;
        if (result.prepare && result.prepare.length > 0) summaryHtml += `<h4>🎒 Bring or Prepare</h4 > <ul>${result.prepare.map(t => '<li>' + t + '</li>').join('')}</ul>`;

        if (!summaryHtml) summaryHtml = "<p>No notable insights found for this destination.</p>";

        setChatHistory(prev => [...prev, { role: 'assistant', content: '', summary: summaryHtml }]);
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

  const getTaxonomyIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('inbox')) return '📂';
    if (n.includes('health') || n.includes('medical')) return '🩺';
    if (n.includes('family') || n.includes('people')) return '👥';
    if (n.includes('personal')) return '🗂️';
    if (n.includes('travel')) return '✈️';
    if (n.includes('finance') || n.includes('money')) return '💰';
    return '📁';
  }

  return (
    <div className="app-container">

      {/* --- SIDEBAR --- */}
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
            {taxonomies
              .filter(cat => cat.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
                        .filter(n => n.filename.toLowerCase().includes(searchQuery.toLowerCase()))
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
              ))}
          </div>
        </nav>
      </aside>

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
                      {briefingData.tasks.map((task, i) => <li key={i}><span className="check-icon">✓</span> {task}</li>)}
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

        <div className="center-container">
          {selectedNote ? (
            /* --- NOTE EDITOR --- */
            <div className="note-editor">
              <header className="editor-header">
                <div className="editor-breadcrumbs">
                  <button
                    className="back-btn"
                    onClick={() => setSelectedNote(null)}
                    title="Back to home"
                  >
                    <span className="material-icons" style={{ fontSize: '20px' }}>arrow_back</span>
                  </button>
                  <span>Projects</span>
                  <span>/</span>
                  <span>{selectedNote.category}</span>
                </div>

                <h2 style={{
                  fontSize: '20px',
                  fontWeight: 'normal',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getDisplayTitle(selectedNote.content, selectedNote.filename)}
                </h2>

                <div className="editor-meta">
                  {isSaving ? 'Saving...' : 'Saved'}
                </div>
              </header>

              {/* Inline Editor */}

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
                {(() => {
                  const { props, body } = parseNoteContent(selectedNote.content);
                  const chunks = body.split(/(!\[\[.*?\]\])/g);

                  return chunks.map((chunk, i) => {
                    if (chunk.startsWith('![[') && chunk.endsWith(']]')) {
                      const imgName = chunk.slice(3, -2);
                      let imgUrl = `${API_BASE_URL}/api/capture/media/${encodeURIComponent(selectedNote.category)}/${encodeURIComponent(imgName)}`;

                      if (imgName.toLowerCase().endsWith('.heic')) {
                        imgUrl += '.jpg';
                      }

                      return (
                        <div key={i} className="inline-image-wrapper">
                          <input
                            className="inline-image-syntax"
                            value={chunk}
                            style={{ display: 'none' }} // Hidden as requested by the user
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
                              const newChunks = [...chunks];
                              newChunks[i] = ''; // Set chunk to empty string to remove it
                              setSelectedNote({ ...selectedNote, content: joinNoteContent(props, newChunks.join('')) });
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
                        onChange={(e) => {
                          e.target.style.height = '0px';
                          e.target.style.height = e.target.scrollHeight + 'px';
                          const newChunks = [...chunks];
                          newChunks[i] = e.target.value;
                          setSelectedNote({ ...selectedNote, content: joinNoteContent(props, newChunks.join('')) });
                        }}
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
                  });
                })()}
              </div>

              {/* Note Properties (Frontmatter) */}
              {Object.keys(parseNoteContent(selectedNote.content).props).length > 0 && (
                <div className="note-properties" style={{ marginTop: '24px' }}>
                  <div
                    className="properties-header"
                    onClick={() => setIsPropertiesExpanded(!isPropertiesExpanded)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span className="material-icons">list_alt</span>
                    Properties {isPropertiesExpanded ? '▾' : '▸'}
                  </div>
                  {isPropertiesExpanded && (
                    <div className="properties-grid">
                      {Object.entries(parseNoteContent(selectedNote.content).props).map(([key, value]) => (
                        <div key={key} className="property-row">
                          <span className="property-key">{key}</span>
                          <span className="property-value">
                            {Array.isArray(value) ? (
                              <div className="property-tags">
                                {value.map((tag, i) => <span key={i} className="prop-tag">{tag}</span>)}
                              </div>
                            ) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="editor-actions">
                <button className="btn btn-glow" onClick={handleReanalyze}>Re-analyze</button>
                <div className="move-group">
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
                <div className="action-group" style={{ marginLeft: 'auto' }}>
                  <button className="btn btn-warning" onClick={handleDeleteNote}>Delete</button>
                </div>
              </div>
            </div>
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
                        {msg.summary || msg.content}
                        {msg.timeline && msg.timeline.length > 0 && (
                          <div className="query-timeline" style={{ marginTop: '16px' }}>
                            {msg.timeline.map((t, i) => (
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
      </main>

      {/* --- AMBIENT ASSISTANT PANEL --- */}
      {isChatPanelOpen && (
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
      )}

      {/* --- GLOBAL UI --- */}
      {!isChatPanelOpen && (
        <button className="chat-toggle-btn" onClick={() => setIsChatPanelOpen(true)}>💬</button>
      )}

      <div className="toast-container">
        {toastFlags.map((toast) => (
          <div key={toast.id} className="toast-flag">
            <div className="toast-content">{toast.message}</div>
            <button className="toast-close" onClick={() => setToastFlags(prev => prev.filter(t => t.id !== toast.id))}>✕</button>
          </div>
        ))}
      </div>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vault Configuration</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <input
                className="setting-input"
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                placeholder="Vault path..."
              />
              <button className="btn btn-save" onClick={handleSaveConfig}>Save</button>

              <div className="settings-danger-zone" style={{ marginTop: '32px', borderTop: '1px solid var(--c-border)', paddingTop: '16px' }}>
                <h4 style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '8px' }}>Danger Zone</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="setting-input"
                    placeholder="Type 'delete' to clear vault..."
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                  />
                  <button className="btn btn-warning" onClick={handleClearVault} disabled={isClearing}>
                    {isClearing ? 'Clearing...' : 'Clear Vault'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

    </div>
  )
}

export default App
