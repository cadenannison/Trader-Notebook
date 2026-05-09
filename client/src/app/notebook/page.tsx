import { BookOpen } from "lucide-react";

export default function NotebookPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
      <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
        <BookOpen size={20} className="text-brand" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Notebook</h1>
      <p className="text-sm text-slate-500 max-w-xs">
        Your active alerts, triggered levels, and trade log will appear here.
      </p>
    </div>
  );
}
