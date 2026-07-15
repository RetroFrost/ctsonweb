import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import ProjectsPage from "./pages/ProjectsPage";
import EditorPage from "./pages/EditorPage";

export default function App() {
  return (
    <HashRouter>
      <Toaster theme="dark" position="bottom-right" richColors />
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/editor/:projectId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
