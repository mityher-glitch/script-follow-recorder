import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import "./App.css";

type LineStatus = "none" | "done" | "redo" | "verified" | "skipped";
type ViewMode = "manuscript" | "recording" | "post";
type ContextMode = "script" | "speaker";

type ScriptBlock = {
  id: number;
  raw: string;
  lines: string[];
  type: "chapter" | "content" | "cue";
  speaker?: string;
  status: LineStatus;
  note: string;
};

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

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/　+/g, "");
}

function isChapter(line: string) {
  return /^第[０-９0-9一二三四五六七八九十百]+[－\-]?[０-９0-9一二三四五六七八九十百]*章$/.test(
    line.trim()
  );
}

function isCueLine(line: string) {
  return /^(se[+>|<]|bg[+>|<])\s*/i.test(line.trim());
}

function isPauseLine(line: string) {
  return /^（停頓.*秒）$/.test(line.trim()) || /^\(停頓.*秒\)$/.test(line.trim());
}

function isBracketOnly(line: string) {
  return /^（.*）$/.test(line.trim()) || /^\(.*\)$/.test(line.trim());
}

function getSpeaker(line: string) {
  const match = line.match(/^([^：:［\[\(（]{1,12})[：:]/);
  return match ? match[1].trim() : undefined;
}

function hasDialogue(lines: string[]) {
  return lines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isChapter(trimmed)) return false;
    if (isCueLine(trimmed)) return false;
    if (isPauseLine(trimmed)) return false;
    if (isBracketOnly(trimmed)) return false;
    return true;
  });
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, "\n")
    .replace(/　+/g, " ")
    .replace(/[ ]{3,}/g, "  ")
    .replace(/(^|\n)\s*(se[+>|<])\s*/gi, "\n$2 ")
    .replace(/(^|\n)\s*(bg[+>|<])\s*/gi, "\n$2 ")
    .replace(
      /(第[０-９0-9一二三四五六七八九十百]+[－\-]?[０-９0-9一二三四五六七八九十百]*章)/g,
      "\n$1\n"
    );
}

function parseScript(text: string): ScriptBlock[] {
  const normalized = normalizeText(text);
  const rawLines = normalized.split("\n");

  const blocks: ScriptBlock[] = [];
  let buffer: string[] = [];
  let id = 0;

  function flushBuffer() {
    const clean = buffer.map((line) => line.trim()).filter(Boolean);
    if (clean.length === 0) {
      buffer = [];
      return;
    }

    const speaker = clean.map(getSpeaker).find(Boolean);

    blocks.push({
      id: id++,
      raw: clean.join("\n"),
      lines: clean,
      type: hasDialogue(clean) ? "content" : "cue",
      speaker,
      status: "none",
      note: "",
    });

    buffer = [];
  }

  for (const line of rawLines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushBuffer();
      continue;
    }

    if (isChapter(trimmed)) {
      flushBuffer();
      blocks.push({
        id: id++,
        raw: trimmed,
        lines: [trimmed],
        type: "chapter",
        status: "none",
        note: "",
      });
      continue;
    }

    if (isCueLine(trimmed)) {
      if (buffer.length > 0 && hasDialogue(buffer)) {
        flushBuffer();
      }

      buffer.push(trimmed);
      continue;
    }

    buffer.push(trimmed);
  }

  flushBuffer();
  return blocks;
}

function highlightLine(line: string) {
  const trimmed = line.trim();
  const commandMatch = trimmed.match(/^(se[+>|<]|bg[+>|<])\s*(.*)$/i);

  if (commandMatch) {
    const command = commandMatch[1];
    const text = commandMatch[2];

    return (
      <>
        <span className={`cue-tag ${command.toLowerCase().startsWith("bg") ? "bg" : "se"}`}>
          {command}
        </span>
        <span className="cue-text">{text}</span>
      </>
    );
  }

  if (isPauseLine(trimmed)) return <span className="pause-text">{trimmed}</span>;

  if (/^（＊.*）$/.test(trimmed) || /^\(＊.*\)$/.test(trimmed)) {
    return <span className="performance-text">{trimmed}</span>;
  }

  if (isBracketOnly(trimmed)) return <span className="hint-text">{trimmed}</span>;

  const speaker = getSpeaker(trimmed);

  if (speaker) {
    const content = trimmed.replace(/^([^：:［\[\(（]{1,12})[：:]/, "");
    return (
      <>
        <span className="speaker">{speaker}</span>
        <span>{content}</span>
      </>
    );
  }

  return <span>{trimmed}</span>;
}

export default function App() {
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("manuscript");
  const [contextMode, setContextMode] = useState<ContextMode>("script");
  const [selectedSpeaker, setSelectedSpeaker] = useState("全部角色");
  const [fontSize, setFontSize] = useState(28);
  const [searchText, setSearchText] = useState("");
  const [showToolbar, setShowToolbar] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [showRedoList, setShowRedoList] = useState(false);

  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  const speakers = useMemo(
    () =>
      Array.from(
        new Set(blocks.map((block) => block.speaker).filter(Boolean))
      ) as string[],
    [blocks]
  );

  const chapters = useMemo(
    () =>
      blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.type === "chapter"),
    [blocks]
  );

  const redoBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.status === "redo");

  const postBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.lines.some(isCueLine));

  const recordableBlocks = blocks.filter((block) => block.type === "content");

  const doneCount = recordableBlocks.filter(
    (block) => block.status === "done" || block.status === "verified"
  ).length;

  const searchResults = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => {
      const keyword = normalizeSearchText(searchText);
      if (!keyword) return false;

      const target = normalizeSearchText(
        [block.raw, block.lines.join(""), block.speaker || "", block.note || ""].join("")
      );

      return target.includes(keyword);
    })
    .slice(0, 40);

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
        alert("目前只支援 .txt 與 .docx 檔案。");
        return;
      }

      const parsed = parseScript(text);
      const firstContent = parsed.findIndex((block) => block.type === "content");

      setBlocks(parsed);
      setCurrentIndex(firstContent >= 0 ? firstContent : 0);
      setSelectedSpeaker("全部角色");
      setSearchText("");
    } catch (error) {
      console.error(error);
      alert("檔案讀取失敗，請確認檔案格式。");
    }
  }

  function isTargetBlock(block: ScriptBlock) {
    if (block.type !== "content") return false;
    if (selectedSpeaker === "全部角色") return true;
    return block.speaker === selectedSpeaker;
  }

  function findNextTarget(start: number) {
    for (let i = start + 1; i < blocks.length; i++) {
      if (isTargetBlock(blocks[i])) return i;
    }
    return start;
  }

  function findPrevTarget(start: number) {
    for (let i = start - 1; i >= 0; i--) {
      if (isTargetBlock(blocks[i])) return i;
    }
    return start;
  }

  function goNext() {
    setCurrentIndex((prev) =>
      viewMode === "recording"
        ? findNextTarget(prev)
        : Math.min(prev + 1, blocks.length - 1)
    );
  }

  function goPrev() {
    setCurrentIndex((prev) =>
      viewMode === "recording"
        ? findPrevTarget(prev)
        : Math.max(prev - 1, 0)
    );
  }

  function markStatus(status: LineStatus) {
    setBlocks((prev) =>
      prev.map((block, index) =>
        index === currentIndex ? { ...block, status } : block
      )
    );
  }

  function updateNote(index: number, note: string) {
    setBlocks((prev) =>
      prev.map((block, i) => (i === index ? { ...block, note } : block))
    );
  }

  function jumpTo(index: number) {
    setCurrentIndex(index);
    setViewMode("manuscript");
    setSearchText("");
  }

  function increaseFontSize() {
    setFontSize((prev) => Math.min(prev + 2, 56));
  }

  function decreaseFontSize() {
    setFontSize((prev) => Math.max(prev - 2, 18));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
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
    const content =
      redoBlocks
        .map(
          ({ block, index }) =>
            `${index + 1}. ${block.raw}${block.note ? `\n備註：${block.note}` : ""}`
        )
        .join("\n\n") || "目前沒有重錄內容。";

    downloadText("重錄清單.txt", content);
  }

  function exportCueList() {
    const content =
      postBlocks.map(({ block, index }) => `${index + 1}. ${block.raw}`).join("\n\n") ||
      "目前沒有音效 cue。";

    downloadText("後製Cue清單.txt", content);
  }

  function exportStatusList() {
    const content =
      blocks
        .map(
          (block, index) =>
            `${index + 1}. [${statusLabel(block.status)}]\n${block.raw}${
              block.note ? `\n備註：${block.note}` : ""
            }`
        )
        .join("\n\n") || "目前沒有內容。";

    downloadText("全部錄製狀態.txt", content);
  }

  function exportSpeakerLines() {
    const target = selectedSpeaker;

    const content =
      blocks
        .filter((block) =>
          target === "全部角色" ? block.type === "content" : block.speaker === target
        )
        .map(
          (block, index) =>
            `${index + 1}. [${statusLabel(block.status)}]\n${block.raw}${
              block.note ? `\n備註：${block.note}` : ""
            }`
        )
        .join("\n\n") || "沒有可匯出的台詞。";

    downloadText(`${target}-台詞表.txt`, content);
  }

  function getRecordingContext() {
    if (contextMode === "speaker" && blocks[currentIndex]?.speaker) {
      const speaker = blocks[currentIndex].speaker;
      const sameSpeakerIndexes = blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.speaker === speaker);

      const currentPosition = sameSpeakerIndexes.findIndex(({ index }) => index === currentIndex);

      return {
        prev: currentPosition > 0 ? sameSpeakerIndexes[currentPosition - 1].block : undefined,
        current: blocks[currentIndex],
        next:
          currentPosition < sameSpeakerIndexes.length - 1
            ? sameSpeakerIndexes[currentPosition + 1].block
            : undefined,
      };
    }

    return {
      prev: blocks[currentIndex - 1],
      current: blocks[currentIndex],
      next: blocks[currentIndex + 1],
    };
  }

  const recordingContext = getRecordingContext();

  useEffect(() => {
    const saved = localStorage.getItem("script-follow-recorder-v3");

    if (saved) {
      try {
        const data = JSON.parse(saved);
        setBlocks(data.blocks || []);
        setCurrentIndex(data.currentIndex || 0);
        setViewMode(data.viewMode || "manuscript");
        setContextMode(data.contextMode || "script");
        setSelectedSpeaker(data.selectedSpeaker || "全部角色");
        setFontSize(data.fontSize || 28);
        setShowToolbar(data.showToolbar ?? true);
        setHighContrast(data.highContrast || false);
      } catch {
        localStorage.removeItem("script-follow-recorder-v3");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "script-follow-recorder-v3",
      JSON.stringify({
        blocks,
        currentIndex,
        viewMode,
        contextMode,
        selectedSpeaker,
        fontSize,
        showToolbar,
        highContrast,
      })
    );
  }, [
    blocks,
    currentIndex,
    viewMode,
    contextMode,
    selectedSpeaker,
    fontSize,
    showToolbar,
    highContrast,
  ]);

  useEffect(() => {
    if (viewMode !== "manuscript") return;

    const el = blockRefs.current[currentIndex];

    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex, viewMode]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

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
        setViewMode((prev) => (prev === "recording" ? "manuscript" : "recording"));
      }

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setViewMode((prev) => (prev === "post" ? "manuscript" : "post"));
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
  }, [blocks, currentIndex, viewMode, selectedSpeaker]);

  function renderBlockLines(block: ScriptBlock) {
    return block.lines.map((line, index) => (
      <div
        key={`${block.id}-${index}`}
        className={[
          "script-line",
          isCueLine(line) ? "cue-line" : "",
          isPauseLine(line) ? "pause-line" : "",
          isBracketOnly(line) ? "hint-line" : "",
        ].join(" ")}
      >
        {highlightLine(line)}
      </div>
    ));
  }

  function renderRecordingCard(block: ScriptBlock | undefined, role: "prev" | "current" | "next") {
    if (!block) return <div className={`record-card ${role} empty-card`}>沒有內容</div>;

    return (
      <div className={`record-card ${role} ${block.status}`}>
        {renderBlockLines(block)}
        {block.note && <div className="record-note">備註：{block.note}</div>}
      </div>
    );
  }

  return (
    <div className={["app", highContrast ? "high-contrast" : ""].join(" ")}>
      {showToolbar && (
        <>
          <header className="topbar">
            <div>
              <h1>錄音劇本跟讀器 v3</h1>
              <p>原稿保留版 / 音聲工作流</p>
            </div>

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
            <button onClick={() => setViewMode("manuscript")}>原稿模式</button>
            <button onClick={() => setViewMode("recording")}>錄音模式</button>
            <button onClick={() => setViewMode("post")}>後製模式</button>

            <label>角色</label>
            <select value={selectedSpeaker} onChange={(e) => setSelectedSpeaker(e.target.value)}>
              <option value="全部角色">全部角色</option>
              {speakers.map((speaker) => (
                <option key={speaker} value={speaker}>
                  {speaker}
                </option>
              ))}
            </select>

            <button
              onClick={() => setContextMode((prev) => (prev === "script" ? "speaker" : "script"))}
            >
              {contextMode === "script" ? "前後文模式" : "同角色模式"}
            </button>

            <button onClick={decreaseFontSize}>A-</button>
            <button onClick={increaseFontSize}>A+</button>
            <button onClick={() => setHighContrast((prev) => !prev)}>高對比</button>
            <button onClick={toggleFullscreen}>全螢幕</button>
            <button onClick={() => setShowToolbar(false)}>隱藏工具列</button>
          </div>

          <div className="toolbar secondary">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) jumpTo(Number(e.target.value));
              }}
            >
              <option value="">章節跳轉</option>
              {chapters.map(({ block, index }) => (
                <option key={block.id} value={index}>
                  {block.raw}
                </option>
              ))}
            </select>

            <input
              className="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜尋台詞 / 音效 / 章節"
            />

            <button onClick={() => setShowRedoList((prev) => !prev)}>
              {showRedoList ? "關閉重錄清單" : "重錄清單"}
            </button>
            <button onClick={exportRedoList}>匯出重錄</button>
            <button onClick={exportSpeakerLines}>匯出角色台詞</button>
            <button onClick={exportCueList}>匯出 Cue</button>
            <button onClick={exportStatusList}>匯出全部狀態</button>
          </div>

          <div className="stats">
            <strong>錄製進度：</strong>
            {doneCount} / {recordableBlocks.length}
            <span>目前模式：{viewMode}</span>
          </div>

          <div className="privacy-notice">
            <strong>隱私說明：</strong>
            本工具不會上傳劇本文本。所有劇本、錄製狀態與備註僅儲存在您的瀏覽器本機。
            <br />
            <strong>提醒：</strong>
            若清除瀏覽器資料、使用無痕模式或更換裝置，進度可能消失，請自行保留原始劇本備份。
          </div>

          <div className="help">
            Enter/↓：下一項　↑：上一項　F：已錄　R：重錄　V：已確認　X：棄用　C：清除　M：錄音模式　P：後製模式　H：隱藏工具列
          </div>
        </>
      )}

      {!showToolbar && (
        <button className="floating-button" onClick={() => setShowToolbar(true)}>
          顯示工具列
        </button>
      )}

      {showRedoList && showToolbar && (
        <aside className="side-panel">
          <h2>重錄清單</h2>
          {redoBlocks.length === 0 && <p>目前沒有標記重錄的內容。</p>}
          {redoBlocks.map(({ block, index }) => (
            <div key={block.id} className="side-item" onClick={() => jumpTo(index)}>
              <strong>{index + 1}</strong>
              <p>{block.raw}</p>
              {block.note && <small>備註：{block.note}</small>}
            </div>
          ))}
        </aside>
      )}

      {searchText.trim() && showToolbar && (
        <aside className="search-panel">
          <h2>搜尋結果</h2>
          {searchResults.length === 0 && <p>沒有找到結果。</p>}
          {searchResults.map(({ block, index }) => (
            <div key={block.id} className="side-item" onClick={() => jumpTo(index)}>
              <strong>{index + 1}</strong>
              <p>{block.raw}</p>
            </div>
          ))}
        </aside>
      )}

      {viewMode === "recording" && (
        <main className="recording-view" style={{ fontSize }}>
          {renderRecordingCard(recordingContext.prev, "prev")}
          {renderRecordingCard(recordingContext.current, "current")}
          {renderRecordingCard(recordingContext.next, "next")}
        </main>
      )}

      {viewMode === "post" && (
        <main className="post-view">
          {postBlocks.length === 0 && <div className="empty">目前沒有偵測到 se/bg cue。</div>}
          {postBlocks.map(({ block, index }) => (
            <div key={block.id} className="post-item" onClick={() => jumpTo(index)}>
              <span className="post-index">{index + 1}</span>
              <div>{renderBlockLines(block)}</div>
            </div>
          ))}
        </main>
      )}

      {viewMode === "manuscript" && (
        <main className="manuscript">
          {blocks.length === 0 && <div className="empty">請先匯入 .txt 或 .docx 劇本</div>}

          {blocks.map((block, index) => (
            <div
              key={block.id}
              ref={(el) => {
                blockRefs.current[index] = el;
              }}
              style={{ fontSize }}
              className={[
                "block",
                block.type,
                block.status,
                index === currentIndex ? "current" : "",
                selectedSpeaker !== "全部角色" &&
                block.speaker !== selectedSpeaker &&
                block.type === "content"
                  ? "dimmed"
                  : "",
              ].join(" ")}
              onClick={() => setCurrentIndex(index)}
            >
              <div className="block-content">{renderBlockLines(block)}</div>

              {block.type === "content" && (
                <div className="block-meta">
                  <span>{statusLabel(block.status)}</span>
                  <input
                    value={block.note}
                    placeholder="備註 / 補錄原因"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateNote(index, e.target.value)}
                  />
                </div>
              )}
            </div>
          ))}
        </main>
      )}
    </div>
  );
}