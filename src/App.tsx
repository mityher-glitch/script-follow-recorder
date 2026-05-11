import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
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



export default function App() {
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSpeaker, setSelectedSpeaker] = useState("全部角色");
  const [recordingMode, setRecordingMode] = useState(false);
  const [recordContextMode, setRecordContextMode] =
    useState<RecordContextMode>("script");
  const [fontSize, setFontSize] = useState(30);

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const speakers = useMemo(
    () =>
      Array.from(
        new Set(lines.map((line) => line.speaker).filter(Boolean))
      ) as string[],
    [lines]
  );

  async function importFile(file: File) {
    const fileName = file.name.toLowerCase();

    try {
      let text = "";

      if (fileName.endsWith(".txt")) {
        text = await file.text();
      } else if (fileName.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();

        const result = await mammoth.extractRawText({
          arrayBuffer,
        });

        text = result.value;
      } else {
        alert("目前只支援 .txt 與 .docx 檔案");
        return;
      }

      const parsed = parseScript(text);

      setLines(parsed);
      setCurrentIndex(0);
      setSelectedSpeaker("全部角色");
    } catch (error) {
      console.error(error);
      alert("檔案讀取失敗");
    }
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

  function findSpeakerRelativeIndex(
    start: number,
    direction: "prev" | "next"
  ) {
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

  function decreaseFontSize() {
    setFontSize((prev) => Math.max(prev - 2, 20));
  }

  function increaseFontSize() {
    setFontSize((prev) => Math.min(prev + 2, 56));
  }

  useEffect(() => {
    const saved = localStorage.getItem("script-follow-recorder");

    if (saved) {
      try {
        const data = JSON.parse(saved);

        setLines(data.lines || []);
        setCurrentIndex(data.currentIndex || 0);
        setSelectedSpeaker(data.selectedSpeaker || "全部角色");
        setRecordingMode(data.recordingMode || false);
        setRecordContextMode(data.recordContextMode || "script");
        setFontSize(data.fontSize || 30);
      } catch {
        localStorage.removeItem("script-follow-recorder");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "script-follow-recorder",
      JSON.stringify({
        lines,
        currentIndex,
        selectedSpeaker,
        recordingMode,
        recordContextMode,
        fontSize,
      })
    );
  }, [
    lines,
    currentIndex,
    selectedSpeaker,
    recordingMode,
    recordContextMode,
    fontSize,
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
        setRecordingMode((prev) => !prev);
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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentIndex, lines, selectedSpeaker]);

  function renderLine(
    line: ScriptLine | undefined,
    type: "prev" | "current" | "next"
  ) {
    if (!line) {
      return <div className={`record-line ${type}`}>沒有台詞</div>;
    }

    return (
      <div className={`record-line ${type} ${line.status}`}>
        {line.speaker && (
          <span className="speaker">{line.speaker}</span>
        )}

        <span>{line.text}</span>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>錄音劇本跟讀器</h1>

        <input
          type="file"
          accept=".txt,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0];

            if (file) {
              importFile(file);
            }
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
          {recordingMode ? "完整模式" : "錄音模式"}
        </button>

        <button
          onClick={() =>
            setRecordContextMode((prev) =>
              prev === "script" ? "speaker" : "script"
            )
          }
        >
          {recordContextMode === "script"
            ? "前後文模式"
            : "同角色模式"}
        </button>

        <button onClick={decreaseFontSize}>A-</button>
        <button onClick={increaseFontSize}>A+</button>
      </div>

      <div className="help">
        Enter / ↓：下一句　↑：上一句　F：已錄　R：重錄　
        V：已確認　X：棄用　C：清除　M：切換模式
      </div>

      <div className="privacy-notice">
        <strong>隱私說明：</strong>
        本工具不會上傳劇本文本。所有劇本、錄製狀態與備註僅儲存在您的瀏覽器本機。
        <br />
        <strong>提醒：</strong>
        若清除瀏覽器資料、使用無痕模式或更換裝置，進度可能消失，請自行保留原始劇本備份。
      </div>

      {recordingMode ? (
        <main
          className="recording-view"
          style={{ fontSize }}
        >
          {renderLine(prevLine, "prev")}
          {renderLine(currentLine, "current")}
          {renderLine(nextLine, "next")}
        </main>
      ) : (
        <main className="script">
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
                selectedSpeaker !== "全部角色" &&
                line.speaker !== selectedSpeaker
                  ? "dimmed"
                  : "",
              ].join(" ")}
              onClick={() => setCurrentIndex(index)}
            >
              {line.speaker && (
                <span className="speaker">{line.speaker}</span>
              )}

              <span>{line.text}</span>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}