export interface TaxonomyCategory {
    name: string
    noteCount: number
}

export interface NotePreview {
    filename: string
    preview: string
    createdAt: string
}

export interface ValidationDetails {
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

export interface SelectedNote {
    filename: string
    content: string
    category: string
}

export interface SearchResult {
    category: string
    filename: string
    title: string
    preview: string
}

export interface CaptureQueueItem {
    id: string;
    text: string;
    category: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    result?: any;
    error?: string;
    file?: File;
}

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    summary?: string
    trend?: string
    // Legacy fields (kept for backwards compatibility if needed during dev)
    timeline?: Array<{ date: string, event: string, source_file?: string }>; // for assistant
    undetermined_items?: Array<{ event: string, source_file?: string }>; // for assistent
}

export interface TripBriefing {
    tasks: string[];
    pastExperiences: string[];
    people: string[];
    prepare: string[];
}

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface ToastFlag {
    id: string;
    message: string;
}

export interface MorningBriefing {
    tasks: string[];
    patterns: string;
    focus: string;
}
