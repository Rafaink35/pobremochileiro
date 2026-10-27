// Ilustração da mochila — protagonista visual da marca Pobre Mochileiro.
export function BackpackMark({ small = false }) {
  return (
    <svg
      className={small ? 'backpack-mark small' : 'backpack-mark'}
      viewBox="0 0 100 112"
      role="img"
      aria-label="Mochila ilustrada, marca do Pobre Mochileiro"
    >
      <g stroke="#0B3D2E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M38 18V11M50 14V5M62 18l4-7" fill="none" />
        <circle cx="50" cy="23" r="10" fill="#F4C542" />
        <path d="M27 30Q27 24 35 24H65Q73 24 73 32V84Q73 94 63 94H37Q27 94 27 84Z" fill="#F6F0E4" />
        <path d="M27 39Q26 28 37 28H63Q74 28 73 39V48H27Z" fill="#7BA58A" />
        <path d="M34 43v14M66 43v14" stroke="#E8785D" strokeWidth="7" />
        <path d="M27 65Q38 56 50 68T73 65V84Q73 94 63 94H37Q27 94 27 84Z" fill="#F4C542" />
        <path d="M28 78Q43 65 54 76T72 77" fill="none" stroke="#F6F0E4" strokeWidth="3" />
        <path d="M43 58l7-10 7 10Z" fill="#E8785D" />
        <path d="M27 51Q18 51 18 61V75Q18 80 27 80M73 51Q82 51 82 61V75Q82 80 73 80" fill="#7BA58A" />
      </g>
    </svg>
  );
}
