import React, { useState, useRef, useLayoutEffect, type FormEvent } from 'react';
import type { CaptureQueueItem, ChatMessage, TripBriefing, ValidationDetails } from '../../types';
import { QuerySummary } from '../common/QuerySummary';

interface CaptureViewProps {
    API_BASE_URL: string;
    selectedCategory: string | null;
    handleSelectCategory: (category: string) => Promise<void>;
    handleSelectSourceFile: (sourceFile: string) => void;
    fetchTaxonomy: () => Promise<void>;
}

export const CaptureView: React.FC<CaptureViewProps> = ({
    API_BASE_URL,
    selectedCategory,
    handleSelectCategory,
    handleSelectSourceFile,
    fetchTaxonomy
}) => {
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

    const captureFileInputRef = useRef<HTMLInputElement>(null)

    const [captureMode, setCaptureMode] = useState<'capture' | 'query'>('capture')
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
    const [isQuerying, setIsQuerying] = useState(false)
    const [captureQueue, setCaptureQueue] = useState<CaptureQueueItem[]>([])
    const [lastCaptureDetails, setLastCaptureDetails] = useState<ValidationDetails | null>(null)

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

    React.useEffect(() => {
        const processQueueItem = async (item: CaptureQueueItem) => {
            setCaptureQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

            try {
                let response;
                if (item.file) {
                    const formData = new FormData();
                    formData.append('file', item.file);
                    if (item.text) formData.append('description', item.text);
                    // Assuming App.tsx passed categories, but here we can just pass selectedCategory or similar
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
    }, [captureQueue, selectedCategory, API_BASE_URL, fetchTaxonomy, handleSelectCategory]);

    const removeQueueItem = (id: string) => {
        setCaptureQueue(q => q.filter(i => i.id !== id));
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
            category: selectedCategory || '', // or pass selectedDestCategory if used from global app
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

    const handleCapturePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const files = e.clipboardData.files;
        if (files && files.length > 0) {
            e.preventDefault();
            setSelectedFile(files[0]);
        }
    };

    return (
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
                    if (captureFileInputRef.current) captureFileInputRef.current.value = '';
                }}
            />

            <form className="capture-form-container" onSubmit={handleSubmitCapture}>
                <textarea
                    className="capture-textarea"
                    placeholder={captureMode === 'capture' ? "What's the thought?" : "What are you looking for?"}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onPaste={handleCapturePaste}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            handleSubmitCapture(e as unknown as FormEvent)
                        }
                    }}
                    disabled={isQuerying}
                    autoFocus
                />
                {selectedFile && (
                    <div className="capture-file-chip-row">
                        <div className="file-chip">
                            <span className="material-icons file-chip-icon">
                                {selectedFile.type.startsWith('image/') ? 'image' : 'description'}
                            </span>
                            <span className="file-chip-name">{selectedFile.name}</span>
                            <button
                                type="button"
                                className="file-chip-remove"
                                onClick={() => setSelectedFile(null)}
                                title="Remove attachment"
                            >
                                <span className="material-icons" style={{ fontSize: '14px' }}>close</span>
                            </button>
                        </div>
                    </div>
                )}
                <div className="capture-form-toolbar">
                    <div className="toolbar-left">
                        {captureMode === 'capture' && (
                            <>
                                <div className="datetime-picker-wrapper toolbar-pill" title="Set Timestamp">
                                    <span className="datetime-display">
                                        {captureDateTime.replace('T', ' ')}
                                    </span>
                                    <input
                                        type="datetime-local"
                                        className="datetime-input-hidden"
                                        value={captureDateTime}
                                        onChange={(e) => setCaptureDateTime(e.target.value)}
                                    />
                                </div>
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
                                    ? <QuerySummary text={msg.summary || msg.content} onSourceClick={handleSelectSourceFile} />
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
    );
};
