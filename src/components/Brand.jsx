import { BackpackMark } from './BackpackMark.jsx';

// Nome da marca: "Pobre Mochileiro" (sem "AI") + slogan aprovado.
export function Brand({ compact = false }) {
  return (
    <div className={'brand ' + (compact ? 'brand-compact' : '')}>
      <BackpackMark small />
      <span className="brand-type">
        <strong>Pobre</strong>
        <strong>Mochileiro</strong>
        {!compact && <em>MAIS MUNDO. MENOS BOLETOS.</em>}
      </span>
    </div>
  );
}
