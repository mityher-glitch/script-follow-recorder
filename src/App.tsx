import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import "./App.css";

type LineStatus = "none" | "done" | "redo" | "verified" | "skipped";
type LineType =
  | "chapter"
  | "dialogue"
  | "se"
  | "bg"
  | "pause"
  | "performance"
  | "position"
  | "cue";

type ViewMode = "full" | "recording" | "post";

type ScriptLine = {
  id: number;
  raw: string;
  text: string;
  type: LineType;
  command?: string;
  speaker?: string;
  status: LineStatus;
  note: string;
};

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, "\n")
    .replace(/　+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/(se[+>|<])/gi, "\n$1 ")
    .replace(/(bg[+>|<])/gi, "\n$1 ")
    .replace(/(第[０-９0-9一二三四五六七八九十百]+[－\-]?[０-９0-9一二三四五六七八九十百]*章)/g, "\n$1\n")
    .replace(/(（停頓[０-９0-9一二三四五六七八九十]*秒）)/g, "\n$1\n")
    .replace(/(\(停頓[０-９0-9一二三四五六七八九十]*秒\))/g, "\n$1\n");
}

function detectLineType(line: string): {
  type: LineType;
  command?: string;
  text: string;
  speaker?: string;
} {
  const trimmed = line.trim();

  if (/^第[０-９0-9一二三四五六七八九十百]+[－\-]?[０-９0-9一二三四五六七八九十百]*章$/.test(trimmed)) {
    return { type: "chapter", text: trimmed };
  }

  const seMatch = trimmed.match(/^(se[+>|<])\s*(.*)$/i);
  if (seMatch) {
    return {
      type: "se",
      command: seMatch[1],
      text: seMatch[2] || trimmed,
    };
  }

  const bgMatch = trimmed.match(/^(bg[+>|<])\s*(.*)$/i);
  if (bgMatch) {
    return {
      type: "bg",
      command: bgMatch[1],
      text: bgMatch[2] || trimmed,
    };
  }

  if (/^（停頓.*秒）$/.test(trimmed) || /^\(停頓.*秒\)$/.test(trimmed)) {
    return { type: "pause", text: trimmed };
  }

  if (/^（＊.*）$/.test(trimmed) || /^\(＊.*\)$/.test(trimmed)) {
    return { type: "performance", text: trimmed };
  }

  if (
    /^（.*位置.*）$/.test(trimmed) ||
    /^（.*主角.*）$/.test(trimmed) ||
    /^（.*左耳.*）$/.test(trimmed) ||
    /^（.*右耳.*）$/.test(trimmed) ||
    /^（.*前方.*）$/.test(trimmed) ||
    /^（.*背後.*）$/.test(trimmed)
  ) {
    return { type: "position", text: trimmed };
  }

  if (/^（.*）$/.test(trimmed) || /^\(.*\)$/.test(trimmed)) {
    return { type: "cue", text: trimmed };
  }

  const speakerMatch = trimmed.match(/^([^：:［\[\(（]{1,12})[：:](.+)$/);
  if (speakerMatch) {
    return {
      type: "dialogue",
      speaker: speakerMatch[1].trim(),
      text: speakerMatch[2].trim(),
    };
  }

  return { type: "dialogue", text: trimmed };
}

function parseScript(text: string): ScriptLine[] {
  const normalized = normalizeText(text);

  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const detected = detectLineType(line);

      return {
        id: index,
        raw: line,
        text: detected.text,
        type: detected.type,
        command: detected.command,
        speaker: detected.speaker,
        status: "none",
        note: "",
      };
    });
}

function statusLabel(status: LineStatus) {
  switch (status) {
    case "done":
      return "已錄";
    case "redo":
      return "重錄";
    case "verified":
      return "已確認";
    case "skipped":
      return "棄用";
    default:
      return "未標記";
  }
}

function typeLabel(type: LineType) {
  switch (type) {
    case "chapter":
      return "章節";
    case "dialogue":
      return "台詞";
    case "se":
      return "SE";
    case "bg":
      return "BG";
    case "pause":
      return "停頓";
    case "performance":
      return "演出";
    case "position":
      return "位置";
    case "cue":
      return "提示";
  }
}

export default function App() {
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [fontSize, setFontSize] = useState(30);
  const [searchText, setSearchText] = useState("");

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const chapters = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => line.type === "chapter"),
    [lines]
  );

  const postLines = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.type === "se" || line.type === "bg"),
    [lines]
  );

  const dialogueCount = lines.filter((line) => line.type === "dialogue").length;
  const doneCount = lines.filter(
    (line) =>
      line.type === "dialogue" &&
      (line.status === "done" || line.status === "verified")
  ).length;

  async function importFile(file: File) {
    const fileName = file.name.toLowerCase();

    try {
      let text = "";

      if (fileName.endsWith(".txt")) {
        text = await file.text();
      } else if (fileName.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        alert("目前只支援 .txt 與 .docx 檔案");
        return;
      }

      const parsed = parseScript(text);
      setLines(parsed);
      setCurrentIndex(parsed.findIndex((line) => line.type === "dialogue") || 0);
      setSearchText("");
    } catch (error) {
      console.error(error);
      alert("檔案讀取失敗，請確認檔案格式。");
    }
  }

  function findNextDialogue(start: number) {
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].type === "dialogue") return i;
    }
    return start;
  }

  function findPrevDialogue(start: number) {
    for (let i = start - 1; i >= 0; i--) {
      if (lines[i].type === "dialogue") return i;
    }
    return start;
  }

  function goNext() {
    setCurrentIndex((prev) =>
      viewMode === "recording"
        ? findNextDialogue(prev)
        : Math.min(prev + 1, lines.length - 1)
    );
  }

  function goPrev() {
    setCurrentIndex((prev) =>
      viewMode === "recording"
        ? findPrevDialogue(prev)
        : Math.max(prev - 1, 0)
    );
  }

  function markStatus(status: LineStatus) {
    setLines((prev) =>
      prev.map((line, index) =>
        index === currentIndex ? { ...line, status } : line
      )
    );
  }

  function updateNote(index: number, note: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, note } : line))
    );
  }

  function jumpTo(index: number) {
    setCurrentIndex(index);
    setViewMode("full");
    setSearchText("");
  }

  function increaseFontSize() {
    setFontSize((prev) => Math.min(prev + 2, 56));
  }

  function decreaseFontSize() {
    setFontSize((prev) => Math.max(prev - 2, 20));
  }

  useEffect(() => {
    const saved = localStorage.getItem("script-follow-recorder-audio-format");

    if (saved) {
      try {
        const data = JSON.parse(saved);
        setLines(data.lines || []);
        setCurrentIndex(data.currentIndex || 0);
        setViewMode(data.viewMode || "full");
        setFontSize(data.fontSize || 30);
      } catch {
        localStorage.removeItem("script-follow-recorder-audio-format");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "script-follow-recorder-audio-format",
      JSON.stringify({
        lines,
        currentIndex,
        viewMode,
        fontSize,
      })
    );
  }, [lines, currentIndex, viewMode, fontSize]);

  useEffect(() => {
    if (viewMode !== "full") return;

    const el = lineRefs.current[currentIndex];

    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex, viewMode]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }

      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        markStatus("done");
      }

      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        markStatus("redo");
      }

      if (e.key.toLowerCase() === "v") {
        e.preventDefault();
        markStatus("verified");
      }

      if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        markStatus("skipped");
      }

      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        markStatus("none");
      }

      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setViewMode((prev) => (prev === "recording" ? "full" : "recording"));
      }

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setViewMode((prev) => (prev === "post" ? "full" : "post"));
      }

      if (e.key === "-") {
        e.preventDefault();
        decreaseFontSize();
      }

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        increaseFontSize();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lines, currentIndex, viewMode]);

  const currentLine = lines[currentIndex];
  const previousContext = lines.slice(Math.max(0, currentIndex - 3), currentIndex);
  const nextContext = lines.slice(currentIndex + 1, currentIndex + 4);

  const searchResults = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) =>
      searchText.trim()
        ? line.raw.toLowerCase().includes(searchText.toLowerCase())
        : false
    )
    .slice(0, 30);

  return (
    <div className="app">
      <header className="topbar">
        <h1>錄音劇本跟讀器：音聲格式版</h1>

        <input
          type="file"
          accept=".txt,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
        />
      </header>

      <div className="toolbar">
        <button onClick={() => setViewMode("full")}>完整模式</button>
        <button onClick={() => setViewMode("recording")}>錄音模式</button>
        <button onClick={() => setViewMode("post")}>後製模式</button>
        <button onClick={decreaseFontSize}>A-</button>
        <button onClick={increaseFontSize}>A+</button>

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) jumpTo(Number(e.target.value));
          }}
        >
          <option value="">章節跳轉</option>
          {chapters.map(({ line, index }) => (
            <option key={line.id} value={index}>
              {line.text}
            </option>
          ))}
        </select>

        <input
          className="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜尋台詞 / 音效 / 章節"
        />
      </div>

      <div className="privacy-notice">
        <strong>隱私說明：</strong>
        本工具不會上傳劇本文本。所有劇本、錄製狀態與備註僅儲存在您的瀏覽器本機。
        <br />
        <strong>提醒：</strong>
        若清除瀏覽器資料、使用無痕模式或更換裝置，進度可能消失，請自行保留原始劇本備份。
      </div>

      <div className="help">
        進度：{doneCount} / {dialogueCount}　Enter/↓：下一項　↑：上一項　F：已錄　R：重錄　V：已確認　X：棄用　C：清除　M：錄音模式　P：後製模式
      </div>

      {searchText && (
        <aside className="side-panel">
          <h2>搜尋結果</h2>
          {searchResults.length === 0 && <p>沒有找到結果。</p>}
          {searchResults.map(({ line, index }) => (
            <div key={line.id} className="side-item" onClick={() => jumpTo(index)}>
              <strong>
                {index + 1}. {typeLabel(line.type)}
              </strong>
              <p>{line.raw}</p>
            </div>
          ))}
        </aside>
      )}

      {viewMode === "recording" && (
        <main className="recording-view" style={{ fontSize }}>
          <section className="context-block">
            {previousContext.map((line) => (
              <div key={line.id} className={`context-line ${line.type}`}>
                <span className="type-badge">{typeLabel(line.type)}</span>
                {line.command && <span className="command">{line.command}</span>}
                {line.raw}
              </div>
            ))}
          </section>

          {currentLine ? (
            <section className={`record-current ${currentLine.type} ${currentLine.status}`}>
              <div className="record-meta">
                <span>{typeLabel(currentLine.type)}</span>
                <span>{statusLabel(currentLine.status)}</span>
              </div>
              <div>{currentLine.text}</div>
            </section>
          ) : (
            <div className="empty">請先匯入 .txt 或 .docx 劇本</div>
          )}

          <section className="context-block">
            {nextContext.map((line) => (
              <div key={line.id} className={`context-line ${line.type}`}>
                <span className="type-badge">{typeLabel(line.type)}</span>
                {line.command && <span className="command">{line.command}</span>}
                {line.raw}
              </div>
            ))}
          </section>
        </main>
      )}

      {viewMode === "post" && (
        <main className="script">
          {postLines.map(({ line, index }) => (
            <div key={line.id} className={`line ${line.type}`} onClick={() => jumpTo(index)}>
              <div className="line-main">
                <span className="type-badge">{typeLabel(line.type)}</span>
                {line.command && <span className="command">{line.command}</span>}
                <span>{line.text}</span>
              </div>
            </div>
          ))}
        </main>
      )}

      {viewMode === "full" && (
        <main className="script">
          {lines.length === 0 && <div className="empty">請先匯入 .txt 或 .docx 劇本</div>}

          {lines.map((line, index) => (
            <div
              key={line.id}
              ref={(el) => {
                lineRefs.current[index] = el;
              }}
              style={{ fontSize }}
              className={[
                "line",
                line.type,
                line.status,
                index === currentIndex ? "current" : "",
              ].join(" ")}
              onClick={() => setCurrentIndex(index)}
            >
              <div className="line-main">
                <span className="type-badge">{typeLabel(line.type)}</span>
                {line.command && <span className="command">{line.command}</span>}
                <span>{line.text}</span>
              </div>

              <div className="line-meta">
                <span>{statusLabel(line.status)}</span>
                <input
                  value={line.note}
                  placeholder="備註"
                  onChange={(e) => updateNote(index, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}