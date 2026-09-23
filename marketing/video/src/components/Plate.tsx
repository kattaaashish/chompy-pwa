// An illustrated Indian plate (roti, rice, dal, bhindi, cucumber) drawn as SVG
// for the camera viewfinder in the opening scene. 540x540 box.
export const Plate = ({ size }: { size: number }) => {
  const rice = Array.from({ length: 70 }, (_, i) => {
    // deterministic scatter inside the rice mound
    const a = i * 2.399;
    const r = 8 + ((i * 37) % 60);
    return { x: 300 + Math.cos(a) * r * 1.35, y: 300 + Math.sin(a) * r, rot: (i * 53) % 180 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 540 540" style={{ display: "block" }}>
      <defs>
        <radialGradient id="plateG" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#FBF8F1" />
          <stop offset="80%" stopColor="#F1EADC" />
          <stop offset="100%" stopColor="#E2D8C6" />
        </radialGradient>
        <radialGradient id="steel" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#F2F4F5" />
          <stop offset="55%" stopColor="#B9BFC4" />
          <stop offset="100%" stopColor="#7E868C" />
        </radialGradient>
        <radialGradient id="dalG" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F3BE52" />
          <stop offset="100%" stopColor="#D2891F" />
        </radialGradient>
        <radialGradient id="rotiG" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F2DDB2" />
          <stop offset="100%" stopColor="#D9B679" />
        </radialGradient>
        <radialGradient id="riceG" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EFE8D8" />
        </radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* plate shadow + plate */}
      <ellipse cx={276} cy={290} rx={236} ry={230} fill="rgba(40,20,5,0.35)" filter="url(#soft)" />
      <circle cx={270} cy={270} r={232} fill="url(#plateG)" />
      <circle cx={270} cy={270} r={232} fill="none" stroke="#DCD1BD" strokeWidth={3} />
      <circle cx={270} cy={270} r={196} fill="none" stroke="#E6DDCC" strokeWidth={2} />

      {/* rice */}
      <ellipse cx={304} cy={308} rx={98} ry={72} fill="rgba(60,40,10,0.18)" filter="url(#soft)" />
      <ellipse cx={300} cy={300} rx={98} ry={72} fill="url(#riceG)" />
      {rice.map((g, i) => (
        <rect
          key={i}
          x={g.x - 5}
          y={g.y - 1.6}
          width={10}
          height={3.2}
          rx={1.6}
          fill="#E6DEC9"
          transform={`rotate(${g.rot} ${g.x} ${g.y})`}
        />
      ))}

      {/* rotis */}
      <g>
        <circle cx={176} cy={214} r={74} fill="rgba(60,40,10,0.18)" filter="url(#soft)" />
        <circle cx={172} cy={208} r={74} fill="url(#rotiG)" />
        {[
          [150, 180, 7],
          [198, 196, 5],
          [166, 232, 6],
          [204, 236, 4],
          [136, 224, 4],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#C89A57" opacity={0.8} />
        ))}
        <circle cx={214} cy={246} r={74} fill="rgba(60,40,10,0.18)" filter="url(#soft)" />
        <circle cx={210} cy={240} r={74} fill="url(#rotiG)" />
        {[
          [190, 214, 6],
          [236, 226, 5],
          [204, 268, 7],
          [244, 262, 4],
          [176, 250, 4],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#C89A57" opacity={0.8} />
        ))}
        <path d="M178 176 q-14 30 6 60" stroke="#B57F3E" strokeWidth={3} fill="none" opacity={0.5} />
      </g>

      {/* dal katori */}
      <g>
        <circle cx={392} cy={186} r={62} fill="rgba(40,20,5,0.3)" filter="url(#soft)" />
        <circle cx={388} cy={180} r={62} fill="url(#steel)" />
        <circle cx={388} cy={180} r={50} fill="#5E6368" opacity={0.35} />
        <circle cx={388} cy={182} r={47} fill="url(#dalG)" />
        {[
          [372, 172, 4],
          [402, 190, 3.5],
          [390, 200, 3],
          [408, 170, 3],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#B8451E" />
        ))}
        <path d="M376 160 c8 -8 18 -6 22 2 c-8 6 -16 6 -22 -2z" fill="#5D8C3A" />
        <path d="M398 198 c6 -8 16 -8 20 -2 c-6 6 -14 8 -20 2z" fill="#6D9C48" />
        <ellipse cx={372} cy={166} rx={14} ry={6} fill="#FFFFFF" opacity={0.28} />
      </g>

      {/* bhindi katori */}
      <g>
        <circle cx={158} cy={366} r={60} fill="rgba(40,20,5,0.3)" filter="url(#soft)" />
        <circle cx={154} cy={360} r={60} fill="url(#steel)" />
        <circle cx={154} cy={360} r={48} fill="#5E6368" opacity={0.35} />
        <circle cx={154} cy={362} r={45} fill="#4F6E33" />
        {[
          [136, 342, -30],
          [166, 340, 20],
          [146, 372, 60],
          [174, 372, -15],
          [156, 356, 95],
          [128, 366, 10],
        ].map(([x, y, rot], i) => (
          <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
            <rect x={x - 14} y={y - 6} width={28} height={12} rx={5} fill="#7FA85A" />
            <circle cx={x - 6} cy={y} r={1.8} fill="#EAF2D4" />
            <circle cx={x + 2} cy={y} r={1.8} fill="#EAF2D4" />
            <circle cx={x + 9} cy={y} r={1.6} fill="#EAF2D4" />
          </g>
        ))}
        <ellipse cx={136} cy={348} rx={12} ry={5} fill="#FFFFFF" opacity={0.15} />
      </g>

      {/* cucumber slices */}
      {[
        [318, 424],
        [356, 442],
        [292, 452],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x + 3} cy={y + 3} r={24} fill="rgba(40,20,5,0.15)" filter="url(#soft)" />
          <circle cx={x} cy={y} r={24} fill="#8FBF5A" />
          <circle cx={x} cy={y} r={20} fill="#E4F3CF" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse
              key={a}
              cx={x}
              cy={y - 9}
              rx={2.4}
              ry={6}
              fill="#C7DEA0"
              transform={`rotate(${a} ${x} ${y})`}
            />
          ))}
        </g>
      ))}

      {/* lemon wedge */}
      <g transform="rotate(-20 412 336)">
        <path d="M384 336 a28 28 0 0 1 56 0z" fill="#F4D33F" />
        <path d="M390 334 a22 22 0 0 1 44 0z" fill="#FBEC8A" />
        <path d="M412 334 v-20 M412 334 l-16 -14 M412 334 l16 -14" stroke="#F4D33F" strokeWidth={1.5} />
      </g>

      {/* spoon resting on the rim */}
      <g transform="rotate(35 470 400)">
        <rect x={462} y={330} width={16} height={150} rx={8} fill="url(#steel)" />
        <ellipse cx={470} cy={320} rx={22} ry={30} fill="url(#steel)" />
        <ellipse cx={468} cy={318} rx={14} ry={22} fill="#9AA2A8" opacity={0.6} />
      </g>
    </svg>
  );
};
