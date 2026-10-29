import { useEffect, useState } from 'react';
import { Sidebar, MobileHeader, BottomNav } from './components/Navigation.jsx';
import { Brand } from './components/Brand.jsx';
import { Toast } from './components/Toast.jsx';
import { Home } from './screens/Home.jsx';
import { Explore } from './screens/Explore.jsx';
import { Detail } from './screens/Detail.jsx';
import { Planner } from './screens/Planner.jsx';
import { Community } from './screens/Community.jsx';
import { Saved } from './screens/Saved.jsx';
import { Transport } from './screens/Transport.jsx';
import { DataSources } from './screens/DataSources.jsx';
import { destinations } from './data/destinations.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';

const SCREENS = ['Início', 'Explorar', 'Detalhe', 'Planejador', 'Comunidade', 'Salvos'];

// Mapeia tela <-> hash da URL, para permitir voltar/avançar no navegador e
// compartilhar um link direto para uma tela (sem backend, só roteamento local).
const SCREEN_TO_HASH = {
  Início: 'inicio',
  Explorar: 'explorar',
  Detalhe: 'detalhe',
  Planejador: 'planejador',
  Comunidade: 'comunidade',
  Salvos: 'salvos',
  Transporte: 'transporte',
  Fontes: 'fontes',
};
const HASH_TO_SCREEN = Object.fromEntries(Object.entries(SCREEN_TO_HASH).map(([k, v]) => [v, k]));

function screenFromHash() {
  const raw = window.location.hash.replace('#', '').split('-')[0];
  return HASH_TO_SCREEN[raw] || 'Início';
}

function destinationIdFromHash() {
  const raw = window.location.hash.replace('#', '');
  const [, id] = raw.split('-');
  return id ? Number(id) : null;
}

const EMPTY_DRAFT = { tripName: '', origin: '', days: '3', budget: '' };

export default function App() {
  const [screen, setScreen] = useState(screenFromHash);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [saved, setSaved] = useLocalStorage('pobre-mochileiro:saved', []);
  const [selectedId, setSelectedId] = useState(() => destinationIdFromHash() ?? destinations[0].id);
  const [draft, setDraft] = useLocalStorage('pobre-mochileiro:planner-draft', EMPTY_DRAFT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');

  const selected = destinations.find((d) => d.id === selectedId) || destinations[0];

  // Sincroniza com o botão voltar/avançar do navegador.
  useEffect(() => {
    const onHashChange = () => {
      setScreen(screenFromHash());
      const id = destinationIdFromHash();
      if (id) setSelectedId(id);
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Título da aba reflete a tela atual — ajuda navegação/acessibilidade.
  useEffect(() => {
    document.title =
      screen === 'Início' ? 'Pobre Mochileiro — Mais mundo. Menos boletos.' : `Pobre Mochileiro — ${screen}`;
  }, [screen]);

  const go = (nextScreen, destinationId) => {
    setScreen(nextScreen);
    setMenuOpen(false);
    const hash = SCREEN_TO_HASH[nextScreen] || 'inicio';
    window.location.hash = destinationId ? `${hash}-${destinationId}` : hash;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const notify = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2400);
  };

  const toggleSave = (id) =>
    setSaved((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));

  const openDestination = (destination) => {
    setSelectedId(destination.id);
    go('Detalhe', destination.id);
  };

  const planTrip = (destination) => {
    setDraft((old) => ({ ...old, tripName: destination.name }));
    go('Planejador');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>

      <Sidebar screen={screen} onNavigate={go} />
      <MobileHeader screen={screen} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((o) => !o)} onNavigate={go} />

      <main className="main-content" id="main-content">
        <div className="topbar">
          <div>
            <span className="topbar-kicker">SEU GUIA DE VIAGEM POSSÍVEL</span>
            <p>
              O mundo é grande. Seu orçamento tem limites. <b>Vamos nessa.</b>
            </p>
          </div>
          <button
            className="profile-chip"
            onClick={() => notify('Perfil pessoal entra na próxima etapa.')}
          >
            <span aria-hidden="true">✳</span> Viajante em construção
          </button>
        </div>

        {screen === 'Início' && (
          <Home
            onNavigate={go}
            onSelectCategory={(c) => {
              setCategory(c);
              go('Explorar');
            }}
            onOpenDestination={openDestination}
            saved={saved}
            onToggleSave={toggleSave}
          />
        )}

        {screen === 'Explorar' && (
          <Explore
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            saved={saved}
            onOpenDestination={openDestination}
            onToggleSave={toggleSave}
            onPlanPlace={planTrip}
          />
        )}

        {screen === 'Detalhe' && (
          <Detail
            destination={selected}
            isSaved={saved.includes(selected.id)}
            onBack={() => go('Explorar')}
            onToggleSave={toggleSave}
            onPlanTrip={planTrip}
          />
        )}

        {screen === 'Planejador' && (
          <Planner
            draft={draft}
            setDraft={setDraft}
            onSaveDraft={() => notify('Rascunho salvo neste navegador.')}
            onSubmit={() => notify('Rascunho atualizado e salvo neste navegador.')}
          />
        )}

        {screen === 'Comunidade' && (
          <Community
            onNewPost={() => notify('Publicação de relatos entra na próxima etapa.')}
            onSavePost={() => notify('Salvamento de relatos será habilitado depois.')}
          />
        )}

        {screen === 'Transporte' && <Transport onNavigate={go} />}

        {screen === 'Fontes' && <DataSources />}

        {screen === 'Salvos' && (
          <Saved saved={saved} onOpenDestination={openDestination} onToggleSave={toggleSave} onNavigate={go} />
        )}

        <footer className="footer">
          <Brand compact />
          <span>Feito pra quem quer ver mais mundo. ✳</span>
          <span>Conceito visual · preços não verificados</span>
          <button className="back-link" onClick={() => go('Fontes')}>
            Fontes de dados
          </button>
        </footer>
      </main>

      <BottomNav screen={screen} onNavigate={go} />
      <Toast message={toast} />
    </div>
  );
}
