import React, { type ReactElement } from 'react';
import TimelineTableToggle from '../TimelineTableToggle';

interface QuerySummaryProps {
    text: string;
    onSourceClick: (f: string) => void;
}

/**
 * Parses structured query response text into React elements.
 * Handles [TABLE], [TIMELINE], [SOURCES] blocks, ### headings,
 * bullet points, inline Category/File.md links, and **bold** text.
 */
export const QuerySummary: React.FC<QuerySummaryProps> = ({ text, onSourceClick }) => {
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
                </div>
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

                    // Apply **bold** formatting within each text segment
                    const applyBold = (segment: string, keyPrefix: string): React.ReactNode[] => {
                        const boldParts = segment.split(/\*\*([^*]+)\*\*/g);
                        return boldParts.map((bp, bi) =>
                            bi % 2 === 1
                                ? <strong key={`${keyPrefix}-b${bi}`}>{bp}</strong>
                                : bp
                        );
                    };

                    elements.push(
                        <p key={`${i}-${ti}`} style={{ whiteSpace: 'pre-wrap' }}>
                            {linkParts.map((lp, li) =>
                                lp.match(/^[A-Z][a-zA-Z_]+\/[^\s,|]+\.md$/) ? (
                                    <button key={li} className="source-link-btn inline" onClick={() => onSourceClick(lp)}>📄 {lp}</button>
                                ) : (
                                    <React.Fragment key={li}>{applyBold(lp, `${i}-${ti}-${li}`)}</React.Fragment>
                                )
                            )}
                        </p>
                    );
                }
            });
        }
    });

    return <>{elements}</>;
};
