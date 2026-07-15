import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Clapperboard, Plus, Copy, Trash2, Upload, Search, Film, LayoutTemplate, Pencil,
} from "lucide-react";
import { api } from "../api";
import { MODEL_LABELS } from "../engine/timing";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const importRef = useRef(null);

  const load = async () => {
    try {
      const [p, t] = await Promise.all([api.get("/projects"), api.get("/templates")]);
      setProjects(p.data);
      setTemplates(t.data);
    } catch {
      toast.error("Could not load projects");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const createProject = async (templateId) => {
    try {
      const { data } = await api.post("/projects", templateId ? { template_id: templateId } : {});
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error("Could not create the project");
    }
  };

  const duplicate = async (id) => {
    await api.post(`/projects/${id}/duplicate`);
    toast.success("Project duplicated");
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this project permanently?")) return;
    await api.delete(`/projects/${id}`);
    toast.success("Project deleted");
    load();
  };

  const rename = async (project) => {
    const name = window.prompt("Project name", project.name);
    if (!name || name === project.name) return;
    await api.put(`/projects/${project.id}`, { name });
    load();
  };

  const importLegacy = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/projects/import-legacy", form);
      toast.success("Project imported");
      navigate(`/editor/${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    }
  };

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen bg-app text-zinc-100">
      <header className="border-b border-line bg-header">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[4px] bg-[#FF3B30] flex items-center justify-center">
              <Clapperboard size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight leading-none">CTS Studio</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Comparison Timeline Editor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button data-testid="import-legacy-btn" className="btn-secondary flex items-center gap-2" onClick={() => importRef.current?.click()}>
              <Upload size={14} /> Import .json project
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden"
              onChange={(e) => { importLegacy(e.target.files?.[0]); e.target.value = ""; }} />
            <button data-testid="new-project-btn" className="btn-primary flex items-center gap-2" onClick={() => createProject()}>
              <Plus size={15} /> New project
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 fade-up">
        <section className="mb-10">
          <div className="ui-label mb-3 flex items-center gap-2"><LayoutTemplate size={12} /> Start from a template</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line">
            {templates.map((t) => (
              <button key={t.id} data-testid={`template-${t.id}`}
                className="bg-panel hover:bg-[#1c1c1c] text-left p-5 transition-colors group"
                onClick={() => createProject(t.id)}>
                <div className="text-sm font-semibold group-hover:text-white">{t.name}</div>
                <div className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{t.description}</div>
                <div className="text-[10px] uppercase tracking-widest text-[#007AFF] mt-3">{MODEL_LABELS[t.model_id]}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="ui-label flex items-center gap-2"><Film size={12} /> Your projects</div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input data-testid="project-search-input" className="input-dark pl-8 w-56" placeholder="Search projects…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-zinc-500 py-12 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-line rounded-[4px] py-16 text-center">
              <p className="text-sm text-zinc-500">No projects yet.</p>
              <button className="btn-primary mt-4" onClick={() => createProject()}>Create your first comparison</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
              {filtered.map((p) => (
                <div key={p.id} data-testid={`project-card-${p.id}`}
                  className="bg-panel hover:bg-[#1c1c1c] p-5 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/editor/${p.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {p.card_count} card{p.card_count === 1 ? "" : "s"} · {MODEL_LABELS[p.model_id] || p.model_id}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-2 font-mono">
                        {new Date(p.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icon" title="Rename" data-testid={`rename-project-${p.id}`} onClick={() => rename(p)}><Pencil size={13} /></button>
                      <button className="btn-icon" title="Duplicate" data-testid={`duplicate-project-${p.id}`} onClick={() => duplicate(p.id)}><Copy size={13} /></button>
                      <button className="btn-icon hover:text-red-400" title="Delete" data-testid={`delete-project-${p.id}`} onClick={() => remove(p.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
