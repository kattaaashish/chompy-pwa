import { useRef } from "react";
import { useStore } from "../../store";
import { Shell } from "../../components";
import { S } from "../../strings";

// Read a File as a bare base64 string (no data-URL prefix) + its mime type.
function readAsBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, mime: file.type });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ModeScreen() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      s.cancelPhoto();
      return;
    }
    const mime = ALLOWED.has(file.type) ? file.type : "image/jpeg";
    const { base64 } = await readAsBase64(file);
    void s.submitPhoto(base64, mime);
  }

  return (
    <Shell>
      <button className="btn-text" onClick={() => s.exitFood()}>
        ← Home
      </button>
      <h2 className="display" style={{ marginTop: 8 }}>
        {S.modeTitle}
      </h2>

      <div className="stack" style={{ marginTop: 24 }}>
        <ModeCard
          title={S.modePhoto}
          hint={S.modePhotoHint}
          emoji="📷"
          onClick={() => fileRef.current?.click()}
        />
        <ModeCard title={S.modeType} hint={S.modeTypeHint} emoji="⌨️" onClick={() => s.chooseType()} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onFile}
      />

      <div className="grow" />
      <p className="body-sm center">{S.modeFooter}</p>
    </Shell>
  );
}

function ModeCard({
  title,
  hint,
  emoji,
  onClick,
}: {
  title: string;
  hint: string;
  emoji: string;
  onClick: () => void;
}) {
  return (
    <button className="card row" style={{ width: "100%", textAlign: "left", border: "none", padding: 18, gap: 16 }} onClick={onClick}>
      <span style={{ fontSize: 30 }} aria-hidden>
        {emoji}
      </span>
      <span>
        <span className="body" style={{ fontWeight: 700, display: "block" }}>
          {title}
        </span>
        <span className="body-sm">{hint}</span>
      </span>
    </button>
  );
}
