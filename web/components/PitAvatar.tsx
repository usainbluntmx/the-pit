"use client";

/**
 * Generated player avatar.
 *
 * There is no upload and no server: the wallet address is the seed, so the same wallet shows
 * the same face everywhere (profile, leaderboard) and nobody can pick a misleading one. The
 * shape is a maw — a ring of teeth around two eyes — which is the app's own visual language
 * rather than a generic identicon.
 */

const ACCENTS = ["#ffb020", "#2ee08a", "#ff4d5e", "#7cc7ff", "#c9a7ff"];

function hash32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarSeed(address: string): number {
  return hash32(address);
}

export function PitAvatar({
  seed,
  size = 88,
  muted = false,
}: {
  seed: string;
  size?: number;
  muted?: boolean;
}) {
  const h = hash32(seed);
  const accent = ACCENTS[h % ACCENTS.length];
  const teeth = 9 + (h % 4);
  const phase = ((h >> 3) % 360) * (Math.PI / 180);
  const eyeTilt = ((h >> 7) % 21) - 10;
  const eyeShape = (h >> 11) % 3;
  const gid = `pit-av-${h.toString(36)}`;

  const ring = Array.from({ length: teeth }, (_, i) => {
    const a = (i / teeth) * Math.PI * 2 + phase;
    const w = ((Math.PI * 2) / teeth) * 0.42;
    const outer = 47;
    const inner = 32 + ((i + h) % 3) * 2;
    const p = (r: number, ang: number) => `${(Math.cos(ang) * r).toFixed(2)},${(Math.sin(ang) * r).toFixed(2)}`;
    return `${p(outer, a - w)} ${p(outer, a + w)} ${p(inner, a)}`;
  });

  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`generated avatar ${seed.slice(0, 6)}`}
      style={{ display: "block", opacity: muted ? 0.55 : 1 }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#1b2029" />
          <stop offset="100%" stopColor="#080a0d" />
        </radialGradient>
        <filter id={`${gid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle r="48" fill={`url(#${gid})`} stroke={accent} strokeOpacity="0.3" strokeWidth="1.4" />

      {ring.map((points, i) => (
        <polygon key={i} points={points} fill={accent} opacity={0.14 + ((i + h) % 4) * 0.07} />
      ))}

      <circle r="30" fill="#0a0c10" stroke="#000" strokeOpacity="0.6" />

      <g filter={`url(#${gid}-glow)`} transform={`rotate(${eyeTilt})`}>
        {eyeShape === 1 ? (
          <>
            <ellipse cx="-12" cy="-4" rx="7" ry="2.6" fill={accent} />
            <ellipse cx="12" cy="-4" rx="7" ry="2.6" fill={accent} />
          </>
        ) : eyeShape === 2 ? (
          <>
            <polygon points="-19,-7 -6,-2 -19,3" fill={accent} />
            <polygon points="19,-7 6,-2 19,3" fill={accent} />
          </>
        ) : (
          <>
            <ellipse cx="-12" cy="-4" rx="4.6" ry="5.4" fill={accent} />
            <ellipse cx="12" cy="-4" rx="4.6" ry="5.4" fill={accent} />
          </>
        )}
      </g>

      <path
        d="M -13 14 Q 0 25 13 14"
        fill="none"
        stroke={accent}
        strokeOpacity="0.75"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {(h >> 13) % 2 === 0 && (
        <>
          <polygon points="-8,16 -5,23 -2,16" fill={accent} opacity="0.55" />
          <polygon points="2,16 5,23 8,16" fill={accent} opacity="0.55" />
        </>
      )}
    </svg>
  );
}
