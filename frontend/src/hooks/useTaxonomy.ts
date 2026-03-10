import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { getTaxonomies, searchTaxonomy, getCategoryNotes, getNoteDetail } from '../services/api';
import type { TaxonomyCategory, NotePreview, SearchResult, SelectedNote, ToastFlag } from '../types/index';

export interface UseTaxonomyConfig {
    setSelectedNote: Dispatch<SetStateAction<SelectedNote | null>>;
    setToastFlags: Dispatch<SetStateAction<ToastFlag[]>>;
    setDynamicEchoes: Dispatch<SetStateAction<string[] | null>>;
}

export interface UseTaxonomyReturn {
    taxonomies: TaxonomyCategory[];
    selectedCategory: string | null;
    setSelectedCategory: (cat: string | null) => void;
    categoryNotes: NotePreview[];
    setCategoryNotes: Dispatch<SetStateAction<NotePreview[]>>;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    searchResults: SearchResult[] | null;
    isSearching: boolean;
    fetchTaxonomy: () => Promise<void>;
    handleSelectCategory: (categoryName: string) => Promise<void>;
    handleSelectSourceFile: (sourceFile: string) => Promise<void>;
}

export function useTaxonomy({
    setSelectedNote,
    setToastFlags,
    setDynamicEchoes
}: UseTaxonomyConfig): UseTaxonomyReturn {
    const [taxonomies, setTaxonomies] = useState<TaxonomyCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const activeCategoryFetchRef = useRef<string | null>(null);
    const [categoryNotes, setCategoryNotes] = useState<NotePreview[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    const fetchTaxonomy = async () => {
        try {
            const res = await getTaxonomies();
            const data = await res.json();
            setTaxonomies(data);
        } catch (err) {
            console.error('Failed to fetch taxonomy', err);
        }
    };

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);

        const abortController = new AbortController();

        const timer = setTimeout(async () => {
            try {
                const res = await searchTaxonomy(searchQuery.trim(), abortController.signal);
                const data: SearchResult[] = await res.json();
                setSearchResults(data);
                console.log(`[hook] Searching for: ${searchQuery.trim()}`);
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.log(`[hook] Search aborted for: ${searchQuery.trim()}`);
                } else {
                    console.error('Search failed', err);
                    setSearchResults([]);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            abortController.abort();
        };
    }, [searchQuery]);

    const handleSelectCategory = async (categoryName: string) => {
        if (selectedCategory === categoryName) {
            setSelectedCategory(null);
            setCategoryNotes([]);
            activeCategoryFetchRef.current = null;
            return;
        }
        setSelectedCategory(categoryName);
        setCategoryNotes([]);
        activeCategoryFetchRef.current = categoryName;
        try {
            const res = await getCategoryNotes(categoryName);
            const data = await res.json();
            if (activeCategoryFetchRef.current === categoryName) {
                setCategoryNotes(data);
            }
        } catch (err) {
            console.error('Failed to fetch notes', err);
        }
    };

    const handleSelectSourceFile = async (sourceFile: string) => {
        if (!sourceFile) return;
        const parts = sourceFile.split('/');
        if (parts.length !== 2) return;
        const categoryName = parts[0];
        const filename = parts[1];

        setSelectedCategory(categoryName);
        setCategoryNotes([]);
        activeCategoryFetchRef.current = categoryName;

        try {
            const res = await getNoteDetail(categoryName, filename);
            const data = await res.json();
            setSelectedNote({ filename: data.filename, content: data.content, category: data.category });

            // Desync Fix: Ensure internal ref matches the returned actual category
            if (data.category !== categoryName) {
                setSelectedCategory(data.category);
                activeCategoryFetchRef.current = data.category;
            }
            setDynamicEchoes(null);
        } catch (err) {
            console.error('Failed to fetch source file note', err);
            setSelectedNote(null);
            const obsidianUri = `obsidian://search?query=${encodeURIComponent(filename.replace('.md', ''))}`;
            setToastFlags(prev => [...prev, {
                id: `note-404-${Date.now()}`,
                message: `📄 Note not found in app: ${sourceFile} — [Open in Obsidian](${obsidianUri})`
            }]);
        }

        try {
            const currentFetchCat = activeCategoryFetchRef.current;
            if (!currentFetchCat) return;
            const catRes = await getCategoryNotes(currentFetchCat);
            const catData = await catRes.json();
            if (activeCategoryFetchRef.current === currentFetchCat) {
                setCategoryNotes(catData);
            }
        } catch (err) {
            console.error('Failed to fetch category notes', err);
        }
    };

    return {
        taxonomies,
        selectedCategory,
        setSelectedCategory,
        categoryNotes,
        setCategoryNotes,
        searchQuery,
        setSearchQuery,
        searchResults,
        isSearching,
        fetchTaxonomy,
        handleSelectCategory,
        handleSelectSourceFile
    };
}
