import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Copy, Trash2, Search, FileSpreadsheet, Download, ClipboardPaste,
  Rows3, Columns3, LayoutList, Table2, Image as ImageIcon,
} from "lucide-react";
import { useEditor } from "../store";
import { api, assetUrl } from "../api";
import { cardBoundaries, outputTimeFromModel, resolveCardsJs, guessFieldMapping } from "../engine/timing";

function CardsTab() {
  const { doc, setSelection, selection, setTime, addCard, duplicateCard, deleteCard } = useEditor();
  const [query, setQuery] = useState("");
  const settings = doc.settings;
  const cards = useMemo(() => resolveCardsJs(doc.spreadsheet, settings.field_mapping || {}), [doc.spreadsheet, settings.field_mapping]);

  const seekTo = (index) => {
    const boundaries = cardBoundaries(cards.length, settings);
    setTime(outputTimeFromModel(boundaries[index] ?? 0, cards.length, settings) + 0.7);
    setSelection({ cardIndex: index, role: "title" });
  };

  const visible = cards.map((card, index) => ({ card, index })).filter(({ card }) => {
    const text = `${card.title} ${card.badge_primary} ${card.description}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 border-b border-line flex gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input data-testid="card-search-input" className="input-dark pl-7 !py-1 text-xs" placeholder="Filter cards…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button data-testid="add-card-btn" className="btn-primary !px-2 !py-1 flex items-center gap-1 text-xs"
          onClick={() => { const index = addCard(); seekTo(index); }}>
          <Plus size={13} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map(({ card, index }) => {
          const thumb = assetUrl(card.image);
          const selected = selection?.cardIndex === index;
          return (
            <div key={index} data-testid={`card-item-${index}`}
              className={`flex items-center gap-2 px-2 py-1.5 border-b border-line cursor-pointer group transition-colors ${selected ? "bg-[#0a2a4e]" : "hover:bg-[#1c1c1c]"}`}
              onClick={() => seekTo(index)}>
              <div className="w-12 h-7 rounded-[2px] bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
                {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={12} className="text-zinc-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-200 truncate">{card.title || <span className="text-zinc-600 italic">Card {index + 1}</span>}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">{card.badge_primary || "—"}</div>
              </div>
              <div className="flex opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button className="btn-icon !p-1" title="Duplicate" onClick={() => duplicateCard(index)}><Copy size={12} /></button>
                <button className="btn-icon !p-1 hover:text-red-400" title="Delete" onClick={() => deleteCard(index)}><Trash2 size={12} /></button>
              </div>
            </div>
          );
        })}
        {!visible.length && <div className="text-xs text-zinc-600 p-4 text-center">No matching cards.</div>}
      </div>
      <div className="p-2 border-t border-line text-[10px] text-zinc-600 font-mono">{cards.length} card{cards.length === 1 ? "" : "s"}</div>
    </div>
  );
}

function parsePastedTable(text) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split(delimiter));
  if (!rows.length) return null;
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row) => {
    while (row.length < width) row.push("");
    return row.map((value) => value.trim());
  };
  return { headers: pad(rows[0]), rows: rows.slice(1).map(pad) };
}

function DataTab() {
  const { doc, setDoc } = useEditor();
  const xlsxRef = useRef(null);
  const sheet = doc.spreadsheet;

  const setCell = (r, c, value) => setDoc((d) => { d.spreadsheet.rows[r][c] = value; return d; });
  const setHeader = (c, value) => setDoc((d) => {
    const old = d.spreadsheet.headers[c];
    d.spreadsheet.headers[c] = value;
    const mapping = d.settings.field_mapping || {};
    Object.keys(mapping).forEach((role) => { if (mapping[role] === old) mapping[role] = value; });
    return d;
  });
  const addRow = () => setDoc((d) => { d.spreadsheet.rows.push(new Array(d.spreadsheet.headers.length).fill("")); return d; });
  const addColumn = () => setDoc((d) => {
    d.spreadsheet.headers.push(`Column ${d.spreadsheet.headers.length + 1}`);
    d.spreadsheet.rows.forEach((row) => row.push(""));
    return d;
  });
  const deleteRow = (r) => setDoc((d) => { d.spreadsheet.rows.splice(r, 1); return d; });
  const deleteColumn = (c) => setDoc((d) => {
    const header = d.spreadsheet.headers[c];
    d.spreadsheet.headers.splice(c, 1);
    d.spreadsheet.rows.forEach((row) => row.splice(c, 1));
    const mapping = d.settings.field_mapping || {};
    Object.keys(mapping).forEach((role) => { if (mapping[role] === header) delete mapping[role]; });
    return d;
  });

  const importXlsx = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/import/xlsx", form);
      setDoc((d) => {
        d.spreadsheet = { headers: data.headers, rows: data.rows };
        d.settings.field_mapping = data.mapping;
        return d;
      });
      toast.success(`Imported ${data.rows.length} rows`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "XLSX import failed");
    }
  };

  const pasteTable = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const table = parsePastedTable(text);
      if (!table) return toast.error("Clipboard has no table data");
      setDoc((d) => {
        d.spreadsheet = table;
        d.settings.field_mapping = guessFieldMapping(table.headers);
        return d;
      });
      toast.success(`Pasted ${table.rows.length} rows`);
    } catch {
      toast.error("Could not read the clipboard. Allow clipboard access and retry.");
    }
  };

  const exportCsv = () => {
    const esc = (value) => (/[,"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const csv = [sheet.headers, ...sheet.rows].map((row) => row.map((value) => esc(String(value ?? ""))).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 border-b border-line flex flex-wrap gap-1.5">
        <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={() => xlsxRef.current?.click()}><FileSpreadsheet size={12} /> XLSX</button>
        <input ref={xlsxRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { importXlsx(e.target.files?.[0]); e.target.value = ""; }} />
        <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={pasteTable}><ClipboardPaste size={12} /> Paste</button>
        <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={exportCsv}><Download size={12} /> CSV</button>
        <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={addRow}><Rows3 size={12} /> Row</button>
        <button className="btn-secondary !px-2 !py-1 text-xs flex items-center gap-1" onClick={addColumn}><Columns3 size={12} /> Column</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full">
          <thead>
            <tr>
              <th className="w-6 bg-[#1A1A1A] border border-line" />
              {sheet.headers.map((header, c) => (
                <th key={c} className="bg-[#1A1A1A] border border-line p-0 min-w-[110px] relative group">
                  <input className="w-full bg-transparent text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1.5 focus:outline-none focus:bg-[#222]"
                    value={header} onChange={(e) => setHeader(c, e.target.value)} />
                  <button className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 btn-icon !p-0.5 hover:text-red-400"
                    title="Delete column" onClick={() => deleteColumn(c)}><Trash2 size={10} /></button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className="group">
                <td className="bg-[#1A1A1A] border border-line text-center relative">
                  <span className="text-[9px] font-mono text-zinc-600 group-hover:hidden">{r + 1}</span>
                  <button className="hidden group-hover:inline-flex btn-icon !p-0.5 hover:text-red-400" title="Delete row" onClick={() => deleteRow(r)}><Trash2 size={10} /></button>
                </td>
                {sheet.headers.map((_, c) => (
                  <td key={c} className="border border-line p-0">
                    <input className="w-full bg-transparent text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:bg-[#12233a]"
                      value={row[c] ?? ""} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeftPanel() {
  const leftTab = useEditor((state) => state.leftTab);
  const set = useEditor.setState;
  return (
    <aside className="w-80 shrink-0 border-r border-line bg-panel flex flex-col min-h-0" data-testid="left-panel">
      <div className="h-9 shrink-0 flex border-b border-line">
        <button className={`flex-1 text-xs flex items-center justify-center gap-1.5 ${leftTab === "cards" ? "text-white border-b-2 border-[#007AFF]" : "text-zinc-500"}`}
          onClick={() => set({ leftTab: "cards" })}><LayoutList size={13} /> Cards</button>
        <button className={`flex-1 text-xs flex items-center justify-center gap-1.5 ${leftTab === "data" ? "text-white border-b-2 border-[#007AFF]" : "text-zinc-500"}`}
          onClick={() => set({ leftTab: "data" })}><Table2 size={13} /> Data</button>
      </div>
      <div className="flex-1 min-h-0">{leftTab === "cards" ? <CardsTab /> : <DataTab />}</div>
    </aside>
  );
}
