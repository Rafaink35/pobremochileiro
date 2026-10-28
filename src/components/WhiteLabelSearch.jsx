import { useEffect } from 'react';
import { Plane } from 'lucide-react';

// White Label Web (Travelpayouts), tipo Widget. O wl_id é público: identifica o widget do
// projeto pobremochileiro.com.br e só funciona nesse domínio.
const SCRIPT_SRC = 'https://tpwgt.com/wl_web/main.js?wl_id=23972';

export function WhiteLabelSearch() {
  useEffect(() => {
    // O widget procura os contêineres quando o script carrega: injeta depois de montá-los.
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  return (
    <section className="wl-search">
      <h3>
        <Plane size={18} aria-hidden="true" /> Buscar passagens
      </h3>
      <div id="tpwl-search" />
      <div id="tpwl-tickets" />
      <p className="flights-note">
        Preços em reais, de cache. A compra termina no site do parceiro, onde a moeda pode aparecer
        diferente: confirme lá antes de pagar.
      </p>
    </section>
  );
}
