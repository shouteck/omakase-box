// The one visual language, shared with K41's film: a small folded paper parcel tied
// with string, on one dotted path out and back. Inline SVG in ink with a slight hand
// wobble. No text inside a drawing, and every step reads fully without it.

/** Once on the page, before any drawing. */
export function ParcelDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <g id="parcel">
          <path className="art-sheet" d="M14 46 C28 51 44 57 59 62 C58.5 70 59.5 79 59 87 C44 82 28 76 13.5 71 C14.5 63 13.5 54 14 46Z" />
          <path className="art-sheet" d="M59 62 C74 57 90 51 106 44 C105.5 52 106.5 61 106 69 C90 76 74 82 59 87 C59.5 79 58.5 70 59 62Z" />
          <path className="art-sheet" d="M14 46 C30 40 46 34 62 28 C77 33 92 38 106 44 C90 51 74 57 59 62 C44 57 28 51 14 46Z" />
          <path className="art-ink" d="M106 44 C100 50 94 54 89 57 C95 60 100 65 106 69" />
          <path className="art-ink" d="M31 39.5 C46 45 62 50 76 56.5" />
          <path className="art-string" d="M36.5 54 C50 48 66 41 83 35" />
          <path className="art-string" d="M36.5 54 C37 61 36 70 36.5 79" />
          <path className="art-string" d="M37 37 C50 42 66 49 81.5 54" />
          <path className="art-string" d="M81.5 54 C82 62 81 70 81.5 77" />
          <path className="art-string" d="M60 44.5 C56 41 54 37 55 33 M60 44.5 C65 42 69 39 70 35" />
          <circle className="art-knot" cx="60" cy="44.5" r="2" />
        </g>
        <g id="letter">
          <path className="art-sheet" d="M3 4 C20 3 40 4.5 57 3.5 C56.5 15 57.5 27 56.5 38.5 C40 38 20 39 3.5 38 C4 27 2.5 15 3 4Z" />
          <path className="art-ink" d="M3.5 5 C13 13 22 20 30 24 C38 20 47 13 56.5 5" />
        </g>
        <g id="page">
          <path className="art-sheet" d="M3 3 C17 2 33 4 47 3 C46 25 48 49 47 71 C33 70 17 72 3 71 C4 49 2 25 3 3Z" />
          <path className="art-ink" d="M11 17 H39 M11 29 H37 M11 41 H31" />
        </g>
      </defs>
    </svg>
  );
}

const Drawing = ({ alt, viewBox = '0 0 200 120', children }) => (
  <svg className="block w-full h-auto max-w-[220px] overflow-visible" viewBox={viewBox} role="img" aria-label={alt}>{children}</svg>
);
const Use = ({ of, x, y, s = 1 }) => <use href={`#${of}`} transform={`translate(${x} ${y}) scale(${s})`} />;
const Dots = ({ d }) => <path className="art-dots" d={d} />;

const OUT = 'M112 118 C210 30 340 8 470 26 C560 38 640 62 676 96';
const BACK = 'M676 112 C620 168 480 184 350 170 C260 160 180 150 124 134';

/** The out-and-back path. It draws itself once on load, unless motion is reduced; at rest it is complete. */
export function HeroDrawing() {
  return (
    <svg className="block w-full h-auto overflow-visible" viewBox="0 0 720 190" role="img" aria-label="A parcel tied with string leaves on a dotted path, travels out and over, and the path comes back carrying a folded letter.">
      <defs>
        <mask id="draw-out" maskUnits="userSpaceOnUse" x="0" y="-10" width="720" height="210"><path className="art-reveal art-reveal-out" d={OUT} pathLength="1" /></mask>
        <mask id="draw-back" maskUnits="userSpaceOnUse" x="0" y="-10" width="720" height="210"><path className="art-reveal art-reveal-back" d={BACK} pathLength="1" /></mask>
      </defs>
      <g mask="url(#draw-out)"><Dots d={OUT} /></g>
      <g mask="url(#draw-back)"><Dots d={BACK} /></g>
      <Use of="parcel" x={6} y={62} s={1.05} />
      <Use of="letter" x={376} y={150} />
    </svg>
  );
}

export const AllowDrawing = () => (
  <Drawing alt="An unfolded sheet of paper with a loose coil of string beside it, and the path about to begin.">
    <Use of="page" x={8} y={24} s={1} />
    <path className="art-string" d="M76 84 C70 74 84 66 94 72 C104 78 96 92 84 88 C74 85 78 72 90 76" />
    <Dots d="M112 70 C132 58 158 54 190 62" />
  </Drawing>
);
export const PackDrawing = () => (
  <Drawing alt="A sheet of paper with a short dotted path to the parcel it folds into, tied with string.">
    <Use of="page" x={8} y={24} s={1} />
    <Dots d="M60 62 C66 60 72 60 80 62" />
    <Use of="parcel" x={82} y={8} />
  </Drawing>
);
export const PostDrawing = () => (
  <Drawing alt="The parcel travels a dotted path out to a posted card with an open marker on it.">
    <Use of="parcel" x={2} y={34} s={0.72} />
    <Dots d="M80 66 C100 38 124 32 142 40" />
    <path className="art-sheet" d="M144 22 C158 21 178 23 194 22 C193 40 195 62 194 80 C178 79 158 81 144 80 C145 62 143 40 144 22Z" />
    <circle className="art-string" cx="156" cy="35" r="4.5" />
    <path className="art-ink" d="M166 35 H186 M154 50 H186 M154 62 H176" />
  </Drawing>
);
export const ReturnDrawing = () => (
  <Drawing alt="Two folded letters come back along the path to the parcel.">
    <Use of="letter" x={136} y={12} s={0.85} />
    <Use of="letter" x={146} y={72} s={0.85} />
    <Dots d="M134 34 C112 40 96 50 84 62" />
    <Dots d="M142 88 C122 90 102 84 84 72" />
    <Use of="parcel" x={2} y={34} s={0.72} />
  </Drawing>
);
export const MergeDrawing = () => (
  <Drawing alt="One letter has settled into the page. The other waits on the path, and the string lies untied.">
    <Use of="page" x={8} y={24} s={1} />
    <Use of="letter" x={15} y={60} s={0.62} />
    <Dots d="M64 62 C88 44 116 44 136 56" />
    <Use of="letter" x={140} y={42} s={0.85} />
    <path className="art-string" d="M78 100 C92 92 108 104 124 96 C134 92 142 98 150 94" />
  </Drawing>
);
export const PayDrawing = () => (
  <Drawing alt="A folded note travels the path from one person's sheet straight to another's, with nothing in between.">
    <Use of="page" x={4} y={36} s={0.7} />
    <Dots d="M42 62 C64 42 84 40 90 44" />
    <Use of="letter" x={88} y={36} s={0.55} />
    <Dots d="M124 48 C136 42 148 46 158 62" />
    <Use of="page" x={160} y={36} s={0.7} />
  </Drawing>
);
export const FindDrawing = () => (
  <Drawing alt="A short list with a small parcel on one of its lines.">
    <path className="art-ink" d="M10 30 C50 29 90 31 130 30 M10 62 C50 61 90 63 130 62 M10 94 C50 93 90 95 130 94" />
    <Use of="parcel" x={134} y={32} s={0.5} />
  </Drawing>
);
export const AnswerDrawing = () => (
  <Drawing alt="A folded letter travels the dotted path to the parcel.">
    <Use of="letter" x={4} y={44} />
    <Dots d="M70 64 C90 48 108 46 124 54" />
    <Use of="parcel" x={112} y={22} s={0.72} />
  </Drawing>
);
export const PaidDrawing = () => (
  <Drawing alt="The letter has settled into a page, and a note comes back along the path.">
    <Use of="page" x={8} y={24} s={1} />
    <Use of="letter" x={15} y={60} s={0.62} />
    <Dots d="M64 60 C94 40 122 42 142 56" />
    <Use of="letter" x={146} y={46} s={0.7} />
  </Drawing>
);
