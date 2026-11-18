/**
 * Device plates — authored geometry, no photographic imitation, no emoji.
 * One stroke weight, one radius language, authentic NexusNight Sigil + Gilt accents.
 */

const sigil = (x: number, y: number, r: number, key: string, withWordmark = true) => (
  <g transform={`translate(${x} ${y})`} key={key}>
    {/* Soft crimson aura */}
    <circle r={r * 1.45} fill="url(#dl-sigil-glow)" />

    {/* Outer Circle */}
    <circle
      r={r}
      fill="rgba(220, 48, 68, 0.12)"
      stroke="var(--dl-blood-hot)"
      strokeWidth={Math.max(1.5, r * 0.065)}
    />

    {/* Inscribed Diamond */}
    <path
      d={`M0 ${-r * 0.88} L${r * 0.88} 0 L0 ${r * 0.88} L${-r * 0.88} 0 Z`}
      fill="none"
      stroke="var(--dl-gilt)"
      strokeWidth={Math.max(1.5, r * 0.055)}
      strokeLinejoin="round"
    />

    {/* Inner golden jewel */}
    <circle r={r * 0.18} fill="var(--dl-gilt)" />
    <circle r={r * 0.1} fill="var(--dl-bone)" />

    {withWordmark && (
      <g transform={`translate(0, ${r + 14})`}>
        <text
          textAnchor="middle"
          fontSize={Math.max(9, r * 0.34)}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          letterSpacing="0.12em"
        >
          <tspan fill="var(--dl-blood-hot)">NEXUS</tspan>
          <tspan dx="4" fill="var(--dl-gilt)">NIGHTS</tspan>
        </text>
      </g>
    )}
  </g>
);

export function PhonePlate() {
  return (
    <svg viewBox="0 0 240 400" role="img" aria-label="Android phone">
      <ellipse cx="120" cy="384" rx="66" ry="8" fill="rgba(0,0,0,0.55)" />

      {/* body */}
      <rect x="42" y="8" width="156" height="372" rx="30" className="da-fill da-line" />
      {/* screen */}
      <rect x="50" y="20" width="140" height="348" rx="22" className="da-fill--crypt da-line da-line--faint" />
      <rect x="50" y="20" width="140" height="348" rx="22" fill="url(#dl-phone-glow)" />

      {/* punch hole + ear slot */}
      <circle cx="120" cy="31" r="2.4" className="da-fill" style={{ fill: 'var(--dl-ash)' }} />
      <rect x="104" y="14" width="32" height="2" rx="1" className="da-fill" style={{ fill: 'rgba(242,235,227,0.28)' }} />

      {sigil(120, 118, 30, 'phone-sigil', true)}

      {/* title + rows */}
      <rect x="70" y="186" width="56" height="3.5" rx="1.75" fill="var(--dl-bone)" />
      <rect x="70" y="202" width="100" height="2" rx="1" fill="rgba(242,235,227,0.24)" />
      <rect x="70" y="214" width="78" height="2" rx="1" fill="rgba(242,235,227,0.18)" />
      <rect x="70" y="226" width="88" height="2" rx="1" fill="rgba(242,235,227,0.12)" />

      {/* mini media rail */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={70 + i * 36}
          y={244}
          width={28}
          height={38}
          rx="3"
          fill={i === 0 ? 'rgba(220,48,68,0.22)' : 'rgba(242,235,227,0.06)'}
          stroke={i === 0 ? 'var(--dl-blood-hot)' : 'rgba(242,235,227,0.12)'}
          strokeWidth="0.8"
        />
      ))}

      {/* live strip */}
      <rect x="70" y="322" width="20" height="2.5" rx="1.25" className="da-fill" style={{ fill: 'var(--dl-blood)' }} />
      <rect x="96" y="322" width="74" height="2.5" rx="1.25" fill="rgba(242,235,227,0.18)" />

      {/* side keys */}
      <path d="M198 118v34M198 166v22" className="da-line da-line--faint" />

      <defs>
        <radialGradient id="dl-phone-glow" cx="50%" cy="34%" r="62%">
          <stop offset="0" stopColor="#b3202f" stopOpacity="0.22" />
          <stop offset="1" stopColor="#b3202f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dl-sigil-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#dc3044" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#dc3044" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function TvPlate() {
  return (
    <svg viewBox="0 0 420 300" role="img" aria-label="Samsung TV">
      <ellipse cx="210" cy="286" rx="96" ry="7" fill="rgba(0,0,0,0.55)" />

      {/* panel */}
      <rect x="18" y="12" width="384" height="216" rx="10" className="da-fill da-line" />
      <rect x="26" y="20" width="368" height="200" rx="5" className="da-fill--crypt da-line da-line--faint" />
      <rect x="26" y="20" width="368" height="200" rx="5" fill="url(#dl-tv-glow)" />

      {sigil(94, 105, 28, 'tv-sigil', true)}

      {/* poster rail */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={244 + i * 48}
            y={58}
            width={40}
            height={116}
            rx="4"
            fill={i === 0 ? 'rgba(220,48,68,0.22)' : 'rgba(242,235,227,0.06)'}
            stroke={i === 0 ? 'var(--dl-blood-hot)' : 'rgba(242,235,227,0.12)'}
            strokeWidth="0.8"
          />
          <rect x={244 + i * 48} y={58} width={40} height={2.5} rx="1" fill={i === 0 ? 'var(--dl-gilt)' : 'rgba(242,235,227,0.2)'} />
        </g>
      ))}

      {/* progress */}
      <rect x="56" y="188" width="192" height="3" rx="1.5" fill="rgba(242,235,227,0.16)" />
      <rect x="56" y="188" width="76" height="3" rx="1.5" fill="var(--dl-blood-hot)" />

      {/* stand */}
      <path d="M186 228v22h48v-22" className="da-line" />
      <path d="M150 262h120" className="da-line" />
      <path d="M150 262l10-12M270 262l-10-12" className="da-line da-line--faint" />

      {/* remote, schematic */}
      <rect x="352" y="228" width="18" height="46" rx="6" className="da-fill--crypt da-line da-line--faint" />
      <circle cx="361" cy="242" r="2.6" className="da-line da-line--gilt" style={{ fill: 'rgba(212,175,106,0.35)' }} />
      <path d="M356 254h10M356 260h10" className="da-line da-line--faint" />

      <defs>
        <radialGradient id="dl-tv-glow" cx="30%" cy="40%" r="70%">
          <stop offset="0" stopColor="#b3202f" stopOpacity="0.25" />
          <stop offset="1" stopColor="#b3202f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dl-sigil-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#dc3044" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#dc3044" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function RoomPlate() {
  return (
    <svg viewBox="0 0 420 300" role="img" aria-label="Discord voice room">
      <ellipse cx="210" cy="286" rx="104" ry="7" fill="rgba(0,0,0,0.55)" />

      {/* window */}
      <rect x="14" y="16" width="392" height="256" rx="12" className="da-fill da-line" />
      <path d="M14 48h392" className="da-line da-line--faint" />

      {/* traffic dots */}
      <circle cx="36" cy="32" r="3" className="da-line da-line--faint" />
      <circle cx="48" cy="32" r="3" className="da-line da-line--faint" />
      <circle cx="60" cy="32" r="3" className="da-line da-line--faint" />

      {/* label */}
      <rect x="80" y="29" width="58" height="5" rx="2.5" fill="rgba(242,235,227,0.22)" />
      {sigil(156, 32, 6.5, 'room-header-sigil', false)}
      <rect x="330" y="27" width="26" height="4" rx="2" fill="var(--dl-blood)" />
      <rect x="362" y="27" width="26" height="4" rx="2" fill="rgba(242,235,227,0.14)" />

      {/* participants */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle
            cx="58"
            cy={84 + i * 46}
            r="13"
            fill={i === 0 ? 'rgba(179,32,47,0.3)' : 'rgba(242,235,227,0.05)'}
            className={i === 0 ? 'da-line da-line--crimson' : 'da-line da-line--faint'}
          />
          {i === 0 ? (
            <circle cx="58" cy={84 + i * 46} r="4" className="da-fill--gilt" />
          ) : (
            <path
              d={`M52 ${84 + i * 46}h12M58 ${78 + i * 46}v12`}
              className="da-line da-line--faint"
            />
          )}
          <rect x="80" y={80 + i * 46} width={i === 0 ? 62 : 48} height="4" rx="2" fill="rgba(242,235,227,0.16)" />
          <rect x="80" y={90 + i * 46} width="30" height="3" rx="1.5" fill="rgba(242,235,227,0.09)" />
        </g>
      ))}

      {/* stage */}
      <rect x="212" y="72" width="164" height="118" rx="8" className="da-fill--crypt da-line da-line--faint" />
      <rect x="212" y="72" width="164" height="118" rx="8" fill="url(#dl-room-glow)" />

      <g transform="translate(294 126)">
        <circle r="26" fill="rgba(179,32,47,0.16)" className="da-line da-line--crimson" />
        <path d="M-6 -11L12 0L-6 11Z" className="da-fill--bone" />
      </g>

      <rect x="222" y="168" width="92" height="2.5" rx="1.25" fill="rgba(242,235,227,0.16)" />
      <rect x="222" y="168" width="34" height="2.5" rx="1.25" fill="var(--dl-blood)" />

      {/* composer */}
      <rect x="34" y="222" width="240" height="26" rx="13" className="da-fill--crypt da-line da-line--faint" />
      <rect x="52" y="233" width="80" height="4" rx="2" fill="rgba(242,235,227,0.12)" />
      <rect x="294" y="222" width="82" height="26" rx="13" fill="rgba(179,32,47,0.16)" className="da-line da-line--crimson" />
      <rect x="318" y="233" width="34" height="4" rx="2" fill="rgba(242,235,227,0.5)" />

      <defs>
        <radialGradient id="dl-room-glow" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#b3202f" stopOpacity="0.2" />
          <stop offset="1" stopColor="#b3202f" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
