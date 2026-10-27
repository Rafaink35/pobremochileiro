import { Sparkles } from 'lucide-react';

// Feedback rápido de ação. role="status" + aria-live para leitores de tela.
export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Sparkles size={16} aria-hidden="true" />
      {message}
    </div>
  );
}
