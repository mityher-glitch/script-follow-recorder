import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type LineStatus = "none" | "done" | "redo" | "verified" | "skipped";
type RecordContextMode = "script" | "speaker";

type ScriptLine = {
  id: number;
  text: string;
  speaker?: string;
  status: LineStatus;
  note?: string;
  isScene?: boolean;
};

function parseScript(text: string): ScriptLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const isScene = /^\[場景\]|^【場景】|^\[Scene\]/i.test(line);
      const match = line.match(/^([^：:［\[\(（]{1,12})[：:]/);

      return {
        id: index,
        text: line,
        speaker: match ? match[1].trim() : undefined,
        status: "none",
        note: "",
        isScene,
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

export default function App() {
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSpeaker, setSelectedSpeaker] = useState("全部角色");
  const [recordingMode, setRecordingMode] = useState(false);
  const [recordContextMode, setRecordContextMode] =
    useState<RecordContextMode>("script");
  const [fontSize, setFontSize] = useState(30);
  const [searchText, setSearchText] = useState("");
  const [showToolbar, setShowToolbar] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [showRedoList, setShowRedoList] = useState(false);

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const speakers = useMemo(
    () =>
      Array.from(
        new Set(lines.map((line) => line.speaker).filter(Boolean))
      ) as string[],
    [lines]
  );

  const scenes = useMemo(
    () =>
      lines
        .map((line, index) => ({ ...line, index }))
        .filter((line) => line.isScene),
    [lines]
  );

  const filteredLines = useMemo(() => {
    if (!searchText.trim()) return lines.map((line, index) => ({ line, index }));

    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) =>
        line.text.toLowerCase().includes(searchText.toLowerCase())
      );
  }, [lines, searchText]);

  const speakerStats = useMemo(() => {
    return speakers.map((speaker) => {
      const speakerLines = lines.filter((line) => line.speaker === speaker);
      const done = speakerLines.filter(
        (line) => line.status === "done" || line.status === "verified"
      ).length;
      const redo = speakerLines.filter((line) => line.status === "redo").length;

      return {
        speaker,
        total: speakerLines.length,
        done,
        redo,
      };
    });
  }, [lines, speakers]);

  const totalDialogueLines = lines.filter((line) => line.speaker).length;
  const totalDoneLines = lines.filter(
    (line) =>
      line.speaker && (line.status === "done" || line.status === "verified")
  ).length;

  const redoLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.status === "redo");

  function importText(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = parseScript(text);
      setLines(parsed);
      setCurrentIndex(0);
      setSelectedSpeaker("全部角色");
    };

    reader.readAsText(file);
  }

  function findNextIndex(start: number) {
    if (lines.length === 0) return 0;

    if (selectedSpeaker === "全部角色") {
      return Math.min(start + 1, lines.length - 1);
    }

    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].speaker === selectedSpeaker) return i;
    }

    return start;
  }

  function findPrevIndex(start: number) {
    if (lines.length === 0) return 0;

    if (selectedSpeaker === "全部角色") {
      return Math.max(start - 1, 0);
    }

    for (let i = start - 1; i >= 0; i--) {
      if (lines[i].speaker === selectedSpeaker) return i;
    }

    return start;
  }

  function findSpeakerRelativeIndex(start: number, direction: "prev" | "next") {
    const speaker = lines[start]?.speaker;

    if (!speaker) return undefined;

    if (direction === "prev") {
      for (let i = start - 1; i >= 0; i--) {
        if (lines[i].speaker === speaker) return lines[i];
      }
    }

    if (direction === "next") {
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].speaker === speaker) return lines[i];
      }
    }

    return undefined;
  }

  const currentLine = lines[currentIndex];
  const prevLine =
    recordContextMode === "speaker"
      ? findSpeakerRelativeIndex(currentIndex, "prev")
      : lines[currentIndex - 1];
  const nextLine =
    recordContextMode === "speaker"
      ? findSpeakerRelativeIndex(currentIndex, "next")
      : lines[currentIndex + 1];

  function goNext() {
    setCurrentIndex((prev) => findNextIndex(prev));
  }

  function goPrev() {
    setCurrentIndex((prev) => findPrevIndex(prev));
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

  function decreaseFontSize() {
    setFontSize((prev) => Math.max(prev - 2, 20));
  }

  function increaseFontSize() {
    setFontSize((prev) => Math.min(prev + 2, 56));
  }

  function jumpTo(index: number) {
    setCurrentIndex(index);
    setSearchText("");
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  function downloadText(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function exportRedoList() {
    const content = redoLines
      .map(
        ({ line, index }) =>
          `${index + 1}. [${line.speaker || "無角色"}] ${line.text}${
            line.note ? `\n備註：${line.note}` : ""
          }`
      )
      .join("\n\n");

    downloadText("重錄清單.txt", content || "目前沒有重錄台詞。");
  }

  function exportSpeakerLines() {
    const target =
      selectedSpeaker === "全部角色" ? "全部角色" : selectedSpeaker;

    const content = lines
      .filter((line) =>
        selectedSpeaker === "全部角色" ? line.speaker : line.speaker === target
      )
      .map((line, index) => {
        return `${index + 1}. [${line.speaker}] [${statusLabel(
          line.status
        )}] ${line.text}${line.note ? `\n備註：${line.note}` : ""}`;
      })
      .join("\n\n");

    downloadText(`${target}-台詞表.txt`, content || "沒有可匯出的台詞。");
  }

  function exportStatusList() {
    const content = lines
      .map((line, index) => {
        return `${index + 1}. [${line.speaker || "無角色"}] [${statusLabel(
          line.status
        )}] ${line.text}${line.note ? `\n備註：${line.note}` : ""}`;
      })
      .join("\n\n");

    downloadText("全部錄製狀態.txt", content || "沒有內容。");
  }

  useEffect(() => {
    const saved = localStorage.getItem("script-follow-recorder-v2");

    if (saved) {
      try {
        const data = JSON.parse(saved);
        setLines(data.lines || []);
        setCurrentIndex(data.currentIndex || 0);
        setSelectedSpeaker(data.selectedSpeaker || "全部角色");
        setRecordingMode(data.recordingMode || false);
        setRecordContextMode(data.recordContextMode || "script");
        setFontSize(data.fontSize || 30);
        setShowToolbar(data.showToolbar ?? true);
        setHighContrast(data.highContrast || false);
      } catch {
        localStorage.removeItem("script-follow-recorder-v2");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "script-follow-recorder-v2",
      JSON.stringify({
        lines,
        currentIndex,
        selectedSpeaker,
        recordingMode,
        recordContextMode,
        fontSize,
        showToolbar,
        highContrast,
      })
    );
  }, [
    lines,
    currentIndex,
    selectedSpeaker,
    recordingMode,
    recordContextMode,
    fontSize,
    showToolbar,
    highContrast,
  ]);

  useEffect(() => {
    if (recordingMode) return;

    const el = lineRefs.current[currentIndex];

    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex, recordingMode]);

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

      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        markStatus("none");
      }

      if (e.key.toLowerCase() === "v") {
        e.preventDefault();
        markStatus("verified");
      }

      if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        markStatus("skipped");
      }

      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setRecordingMode((prev) => !prev);
      }

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowToolbar((prev) => !prev);
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
  }, [currentIndex, lines, selectedSpeaker, recordingMode]);

  function renderRecordLine(
    line: ScriptLine | undefined,
    type: "prev" | "current" | "next"
  ) {
    if (!line) {
      return <div className={`record-line ${type} empty-line`}>沒有台詞</div>;
    }

    return (
      <div className={`record-line ${type} ${line.status}`}>
        {line.speaker && <span className="speaker">{line.speaker}</span>}
        <span>{line.text}</span>
        {line.note && <div className="note">備註：{line.note}</div>}
      </div>
    );
  }

  return (
    <div className={["app", highContrast ? "high-contrast" : ""].join(" ")}>
      {showToolbar && (
        <>
          <header className="topbar">
            <h1>錄音劇本跟讀器 v2</h1>

            <input
              type="file"
              accept=".txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importText(file);
              }}
            />
          </header>

          <div className="toolbar">
            <label>錄製角色：</label>

            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
            >
              <option value="全部角色">全部角色</option>

              {speakers.map((speaker) => (
                <option key={speaker} value={speaker}>
                  {speaker}
                </option>
              ))}
            </select>

            <button onClick={() => setRecordingMode((prev) => !prev)}>
              {recordingMode ? "完整劇本模式" : "錄音模式"}
            </button>

            <button
              onClick={() =>
                setRecordContextMode((prev) =>
                  prev === "script" ? "speaker" : "script"
                )
              }
            >
              {recordContextMode === "script" ? "前後文模式" : "同角色模式"}
            </button>

            <button onClick={decreaseFontSize}>A-</button>
            <button onClick={increaseFontSize}>A+</button>
            <button onClick={() => setHighContrast((prev) => !prev)}>
              高對比
            </button>
            <button onClick={toggleFullscreen}>全螢幕</button>
            <button onClick={() => setShowToolbar(false)}>隱藏工具列</button>
          </div>

          <div className="toolbar secondary">
            <input
              className="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜尋台詞 / 關鍵字 / 角色名"
            />

            <select
              onChange={(e) => {
                const value = e.target.value;
                if (value !== "") jumpTo(Number(value));
              }}
              value=""
            >
              <option value="">場景跳轉</option>
              {scenes.map((scene) => (
                <option key={scene.index} value={scene.index}>
                  {scene.text}
                </option>
              ))}
            </select>

            <button onClick={() => setShowRedoList((prev) => !prev)}>
              {showRedoList ? "關閉重錄清單" : "重錄清單"}
            </button>

            <button onClick={exportRedoList}>匯出重錄</button>
            <button onClick={exportSpeakerLines}>匯出角色台詞</button>
            <button onClick={exportStatusList}>匯出全部狀態</button>
          </div>

          <div className="stats">
            <strong>整體進度：</strong>
            {totalDoneLines} / {totalDialogueLines}
            {speakerStats.map((stat) => (
              <span key={stat.speaker}>
                {stat.speaker}：{stat.done}/{stat.total}，重錄 {stat.redo}
              </span>
            ))}
          </div>

          <div className="help">
            Enter / ↓：下一句　↑：上一句　F：已錄　R：重錄　V：已確認　X：棄用　C：清除　M：切換模式　H：隱藏工具列　- / +：字體
          </div>
        </>
      )}

      {!showToolbar && (
        <button className="floating-button" onClick={() => setShowToolbar(true)}>
          顯示工具列
        </button>
      )}

      {showRedoList && showToolbar && (
        <aside className="redo-panel">
          <h2>重錄清單</h2>

          {redoLines.length === 0 && <p>目前沒有標記重錄的台詞。</p>}

          {redoLines.map(({ line, index }) => (
            <div
              key={line.id}
              className="redo-item"
              onClick={() => jumpTo(index)}
            >
              <strong>{index + 1}. {line.speaker || "無角色"}</strong>
              <p>{line.text}</p>
              {line.note && <small>備註：{line.note}</small>}
            </div>
          ))}
        </aside>
      )}

      {searchText.trim() && showToolbar && (
        <aside className="search-panel">
          <h2>搜尋結果</h2>

          {filteredLines.length === 0 && <p>沒有找到結果。</p>}

          {filteredLines.slice(0, 30).map(({ line, index }) => (
            <div
              key={line.id}
              className="search-item"
              onClick={() => jumpTo(index)}
            >
              <strong>{index + 1}. {line.speaker || "無角色"}</strong>
              <p>{line.text}</p>
            </div>
          ))}
        </aside>
      )}

      {recordingMode ? (
        <main className="recording-view" style={{ fontSize }}>
          {lines.length === 0 ? (
            <div className="empty">請先匯入 .txt 劇本</div>
          ) : (
            <>
              {renderRecordLine(prevLine, "prev")}
              {renderRecordLine(currentLine, "current")}
              {renderRecordLine(nextLine, "next")}
            </>
          )}
        </main>
      ) : (
        <main className="script">
          {lines.length === 0 && (
            <div className="empty">請先匯入 .txt 劇本</div>
          )}

          {lines.map((line, index) => (
            <div
              key={line.id}
              ref={(el) => {
                lineRefs.current[index] = el;
              }}
              style={{ fontSize }}
              className={[
                "line",
                index === currentIndex ? "current" : "",
                line.status,
                line.isScene ? "scene" : "",
                selectedSpeaker !== "全部角色" &&
                line.speaker !== selectedSpeaker
                  ? "dimmed"
                  : "",
              ].join(" ")}
              onClick={() => setCurrentIndex(index)}
            >
              <div>
                {line.speaker && <span className="speaker">{line.speaker}</span>}
                <span>{line.text}</span>
              </div>

              <div className="line-meta">
                <span>{statusLabel(line.status)}</span>

                <input
                  value={line.note || ""}
                  onChange={(e) => updateNote(index, e.target.value)}
                  placeholder="備註"
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