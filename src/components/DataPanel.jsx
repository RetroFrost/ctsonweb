import React, { useMemo, useRef, useState } from 'react';
import { importSpreadsheetFile, normalizeTable, parseDelimitedText } from '../utils/data.js';

function IconButton({ children, title, onClick, danger = false, disabled = false }) {
  return (
    <button className={`small-button${danger ? ' danger' : ''}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function DataPanel({
  project,
  onReplaceData,
  onUpdateCell,
  onAddRow,
  onDuplicateRow,
  onDeleteRow,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onBlank,
  onChooseRowImage,
  onOpenStripImporter,
}) {
  const importRef = useRef(null);
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const data = useMemo(() => normalizeTable(project.data), [project.data]);

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = await importSpreadsheetFile(file);
      onReplaceData(imported);
    } catch (error) {
      alert(`Could not import ${file.name}: ${error.message}`);
    }
  };

  const submitPaste = () => {
    const parsed = parseDelimitedText(pasteText);
    if (!parsed.headers.length) return;
    onReplaceData(parsed);
    setPasteOpen(false);
    setPasteText('');
  };

  return (
    <div className="tab-page data-page">
      <p className="helper-text">One row is one card. Paste a complete table, type directly, or import CSV/XLSX.</p>
      <button className="insert-data-button" onClick={() => setPasteOpen(true)}>＋ CLICK TO INSERT DATA</button>

      <div className="button-grid two-columns">
        <button onClick={() => importRef.current?.click()}>Import CSV/XLSX</button>
        <button onClick={onOpenStripImporter}>Import image strip</button>
        <button onClick={() => onChooseRowImage(selectedRow)} disabled={!data.rows.length}>Choose row image</button>
        <button onClick={() => navigator.clipboard?.readText().then((text) => { setPasteText(text); setPasteOpen(true); }).catch(() => setPasteOpen(true))}>Paste clipboard</button>
      </div>
      <input ref={importRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={importFile} />

      <div className="field-guide">
        <strong>{project.settings.modelId === 'illustrated_cards' ? 'Illustrated Cards' : project.settings.modelId === 'classic_compact' ? 'Classic Compact' : 'Reference Detail'}</strong>
        <span>Double-click cells to edit. Images can be data URLs, HTTP(S) URLs, or uploaded through the row image button.</span>
      </div>

      <div className="spreadsheet-shell">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th className="row-number-heading">#</th>
              {data.headers.map((header, columnIndex) => (
                <th
                  key={`${header}-${columnIndex}`}
                  className={columnIndex === selectedColumn ? 'selected-heading' : ''}
                  onClick={() => setSelectedColumn(columnIndex)}
                  onDoubleClick={() => {
                    const name = prompt('Rename field', header);
                    if (name?.trim()) onRenameColumn(columnIndex, name.trim());
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className={rowIndex === selectedRow ? 'selected-row' : ''}>
                <th onClick={() => setSelectedRow(rowIndex)}>{rowIndex + 1}</th>
                {data.headers.map((header, columnIndex) => (
                  <td key={`${rowIndex}-${columnIndex}`}>
                    <input
                      value={row[columnIndex] ?? ''}
                      onFocus={() => { setSelectedRow(rowIndex); setSelectedColumn(columnIndex); }}
                      onChange={(event) => onUpdateCell(rowIndex, columnIndex, event.target.value)}
                      onPaste={(event) => {
                        const text = event.clipboardData.getData('text/plain');
                        if (!text.includes('\t') && !text.includes('\n')) return;
                        event.preventDefault();
                        const pasted = text.replace(/\r/g, '').split('\n').filter((line) => line.length).map((line) => line.split('\t'));
                        pasted.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
                          onUpdateCell(rowIndex + rowOffset, columnIndex + columnOffset, value, true);
                        }));
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && <div className="empty-table">No cards yet. Paste data or add a card.</div>}
      </div>

      <div className="table-status">{data.rows.length} cards · {data.headers.length} fields</div>
      <div className="toolbar-row wrap">
        <IconButton onClick={onAddRow}>＋ Card</IconButton>
        <IconButton onClick={() => onDuplicateRow(selectedRow)} disabled={!data.rows.length}>Duplicate</IconButton>
        <IconButton danger onClick={() => onDeleteRow(selectedRow)} disabled={!data.rows.length}>Delete</IconButton>
        <span className="toolbar-spacer" />
        <IconButton onClick={onAddColumn}>＋ Field</IconButton>
        <IconButton onClick={() => {
          const current = data.headers[selectedColumn];
          if (!current) return;
          const name = prompt('Rename field', current);
          if (name?.trim()) onRenameColumn(selectedColumn, name.trim());
        }} disabled={!data.headers.length}>Rename</IconButton>
        <IconButton danger onClick={() => onDeleteColumn(selectedColumn)} disabled={data.headers.length <= 1}>Delete field</IconButton>
        <IconButton danger onClick={onBlank}>Blank</IconButton>
      </div>

      {pasteOpen && (
        <div className="modal-backdrop" onMouseDown={() => setPasteOpen(false)}>
          <div className="modal-card paste-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Insert comparison data</h2>
                <p>Paste a table. The first row becomes the field names.</p>
              </div>
              <button className="icon-close" onClick={() => setPasteOpen(false)}>×</button>
            </div>
            <textarea
              value={pasteText}
              autoFocus
              placeholder={'Badge Value\tTitle\tDescription\tImage\n2008\tAndroid 1.0\tFirst release\thttps://…'}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setPasteOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={submitPaste} disabled={!pasteText.trim()}>Insert data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
