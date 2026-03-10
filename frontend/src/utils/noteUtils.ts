export const parseNoteContent = (content: string) => {
    if (!content) return { props: {} as Record<string, any>, body: '' };
    const parts = content.split('---');
    if (parts.length >= 3 && parts[0].trim() === '') {
        const frontmatterRaw = parts[1];
        const rawBody = parts.slice(2).join('---');
        const body = rawBody.replace(/^\n{1,2}/, '');
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

export const joinNoteContent = (props: Record<string, any>, body: string) => {
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

export const getDisplayTitle = (content: string, fallback: string) => {
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
