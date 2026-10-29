import { Compass, Search, Wallet, Users, Bookmark, Menu, X, Route, Tent } from 'lucide-react';
import { Brand } from './Brand.jsx';

export const NAV_ITEMS = [
  ['Início', Compass],
  ['Explorar', Search],
  ['Planejador', Wallet],
  ['Transporte', Route],
  ['Hospedagem', Tent],
  ['Comunidade', Users],
];

function NavButton({ label, Icon, active, onClick }) {
  return (
    <button
      className={'nav-item ' + (active ? 'active' : '')}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

// Menu lateral fixo (desktop/tablet largo).
export function Sidebar({ screen, onNavigate }) {
  return (
    <aside className="sidebar">
      <Brand />
      <p className="sidebar-label">SEU PRÓXIMO ROLÊ</p>
      <nav aria-label="Navegação principal">
        {NAV_ITEMS.map(([label, Icon]) => (
          <NavButton key={label} label={label} Icon={Icon} active={screen === label} onClick={() => onNavigate(label)} />
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sticker">
          <span aria-hidden="true">✳</span>
          <p>
            <b>Mais mundo.</b>
            <br />
            Menos boletos.
          </p>
          <small>UMA VIAGEM DE CADA VEZ</small>
        </div>
        <p className="sidebar-note">Inspiração de viagem, sem preço inventado.</p>
      </div>
    </aside>
  );
}

// Cabeçalho + menu suspenso (telas estreitas).
export function MobileHeader({ screen, menuOpen, onToggleMenu, onNavigate }) {
  return (
    <>
      <header className="mobile-header">
        <button
          className="icon-button"
          onClick={onToggleMenu}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <Brand compact />
        <button className="icon-button" onClick={() => onNavigate('Salvos')} aria-label="Destinos salvos">
          <Bookmark size={20} aria-hidden="true" />
        </button>
      </header>
      {menuOpen && (
        <div className="mobile-menu">
          <nav aria-label="Navegação principal">
            {NAV_ITEMS.map(([label, Icon]) => (
              <NavButton key={label} label={label} Icon={Icon} active={screen === label} onClick={() => onNavigate(label)} />
            ))}
            <button className="nav-item" onClick={() => onNavigate('Salvos')}>
              <Bookmark size={19} aria-hidden="true" />
              Salvos
            </button>
          </nav>
        </div>
      )}
    </>
  );
}

// Barra inferior fixa (telas estreitas) — navegação sempre visível.
export function BottomNav({ screen, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {NAV_ITEMS.map(([label, Icon]) => (
        <button
          key={label}
          className={'bottom-item ' + (screen === label ? 'active' : '')}
          onClick={() => onNavigate(label)}
          aria-current={screen === label ? 'page' : undefined}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
