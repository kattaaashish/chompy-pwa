import { useState } from "react";
import { useStore } from "../../store";
import { Shell, PrimaryButton, ErrorNote } from "../../components";
import { S } from "../../strings";

export function TypeScreen() {
  const s = useStore();
  const [text, setText] = useState("");

  function addLiked(food: string) {
    setText((t) => (t.trim() ? `${t.trim()}, ${food}` : food));
  }

  return (
    <Shell>
      <button className="btn-text" onClick={() => s.openLogMeal()}>
        ← Back
      </button>
      <h2 className="display" style={{ marginTop: 8 }}>
        {S.typeTitle}
      </h2>

      <textarea
        className="field"
        style={{ marginTop: 20 }}
        placeholder={S.typePlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />

      <p className="field-label" style={{ marginTop: 18 }}>
        {S.likedFoodsLabel}
      </p>
      <div className="chip-row">
        {S.likedFoods.map((f) => (
          <button key={f} className="chip" onClick={() => addLiked(f)}>
            {f}
          </button>
        ))}
      </div>

      <ErrorNote>{s.busyError}</ErrorNote>

      <div className="grow" />
      <PrimaryButton disabled={!text.trim()} onClick={() => s.submitText(text.trim())}>
        {S.typeCta}
      </PrimaryButton>
    </Shell>
  );
}
