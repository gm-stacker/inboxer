import { useState } from 'react';

export interface TimelineTableToggleProps {
    headers: string[];
    rows: string[][];
    sourceColIdx: number;
    onSourceClick: (filename: string) => void;
    defaultView?: 'timeline' | 'table';
}

export default function TimelineTableToggle({
    headers,
    rows,
    sourceColIdx,
    onSourceClick,
    defaultView = 'timeline'
}: TimelineTableToggleProps) {
    const [activeView, setActiveView] = useState<'timeline' | 'table'>(defaultView);

    return (
        <div className="timeline-toggle-wrapper">
            <div className="timeline-toggle">
                <button
                    className={`timeline-toggle-btn ${activeView === 'timeline' ? 'active' : ''}`}
                    onClick={() => setActiveView('timeline')}
                >
                    Timeline
                </button>
                <button
                    className={`timeline-toggle-btn ${activeView === 'table' ? 'active' : ''}`}
                    onClick={() => setActiveView('table')}
                >
                    Table
                </button>
            </div>

            {activeView === 'timeline' ? (
                <div className="query-timeline" style={{ marginTop: '16px' }}>
                    {rows.map((row, i) => {
                        const dateStr = row[0] || '';
                        const eventStr = row[1] || '';
                        const details = row.slice(2).filter((_, idx) => idx + 2 !== sourceColIdx);
                        const sourceFile = row[sourceColIdx];

                        return (
                            <div
                                key={i}
                                className={`timeline-item ${sourceFile && sourceFile !== '—' ? 'clickable-item' : ''}`}
                                onClick={() => {
                                    if (sourceFile && sourceFile !== '—') onSourceClick(sourceFile);
                                }}
                            >
                                <div className="note-dot" />
                                <div className="note-content">
                                    <div className="note-date">{dateStr}</div>
                                    <div className="note-title">{eventStr}</div>
                                    {details.map((d, di) => (
                                        <div key={di} className="note-date">{d}</div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="query-table-wrapper">
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
            )}
        </div>
    );
}
