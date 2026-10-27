// Estado vazio reutilizável (sem resultados de busca, sem favoritos, etc.)
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      <Icon size={38} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
