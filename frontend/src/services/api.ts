const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:6130';

// Global error handler wrapper to fulfill constraints
async function fetchWithErr(url: string, options?: RequestInit): Promise<Response> {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`HTTP Error Status: ${res.status}`);
    }
    return res;
}

// --- Taxonomy & Categories ---
export async function getTaxonomies(): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy`);
}
export async function renameCategory(oldName: string, newName: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(oldName)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
    });
}

// --- Notes ---
export async function getCategoryNotes(category: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes`);
}
export async function getNoteDetail(category: string, filename: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}`);
}
export async function updateNoteContent(category: string, filename: string, content: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
}
export async function moveNote(sourceCategory: string, filename: string, targetCategory: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(sourceCategory)}/notes/${encodeURIComponent(filename)}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_category: targetCategory }),
    });
}
export async function deleteNote(category: string, filename: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
    });
}
export async function markNoteAsDone(category: string, filename: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}/done`, {
        method: 'PUT',
    });
}
export async function unmarkNoteAsDone(category: string, filename: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}/done`, {
        method: 'DELETE',
    });
}
export async function reanalyzeNote(category: string, filename: string, instructions?: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/${encodeURIComponent(category)}/notes/${encodeURIComponent(filename)}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: instructions || '' }),
    });
}

// --- Capture & Media ---
export async function captureRawText(text: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
    });
}
export async function uploadMediaCapture(formData: FormData): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/capture/upload`, {
        method: 'POST',
        body: formData, // the browser will set the multipart Content-Type automatically
    });
}
export async function saveConversation(rawText: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/capture/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
    });
}
export async function saveTripContext(destination: string, date: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/tripcontext`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, date }),
    });
}
export function getMediaUrl(category: string, filename: string): string {
    return `${API_BASE_URL}/api/capture/media/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
}

// --- AI & Queries ---
export async function submitChat(message: string, history: any[]): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationHistory: history }),
    });
}
export async function submitQuery(messages: any[], mode: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, mode }),
    });
}
export async function searchTaxonomy(query: string, signal?: AbortSignal): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/taxonomy/search?q=${encodeURIComponent(query)}`, { signal });
}
export async function synthesizeEchoes(content: string, excludeFilename: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/insights/echoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, excludeFilename }),
    });
}

// --- Configuration & Dashboard ---
export async function getBriefing(): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/briefing`);
}
export async function getVaultConfig(): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/config/vault`);
}
export async function saveVaultConfig(path: string): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/config/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
    });
}
export async function clearVaultConfig(): Promise<Response> {
    return fetchWithErr(`${API_BASE_URL}/api/config/vault/clear`, {
        method: 'POST',
    });
}
