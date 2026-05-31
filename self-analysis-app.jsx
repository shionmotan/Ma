import { useState, useEffect, useRef } from "react";

const CATEGORIES = [
  { id: "personality", label: "性格", icon: "◈", color: "#C8B8A2", desc: "強み・弱み・価値観" },
  { id: "skills", label: "スキル", icon: "◎", color: "#A2B8C8", desc: "能力・習熟度" },
  { id: "tendencies", label: "傾向", icon: "◐", color: "#B8A2C8", desc: "行動パターン・習慣" },
  { id: "fashion", label: "ファッション", icon: "◉", color: "#A2C8B0", desc: "似合う服・スタイル" },
  { id: "career", label: "経歴", icon: "◑", color: "#C8C0A2", desc: "経験・転機・学び" },
  { id: "relationships", label: "関係性", icon: "◌", color: "#C8A2A2", desc: "人間関係の傾向" },
];

const INITIAL_DATA = {
  personality: [],
  skills: [],
  tendencies: [],
  fashion: [],
  career: [],
  relationships: [],
};

const STORAGE_KEY = "self-os-data-v1";

async function loadFromStorage() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    return result ? JSON.parse(result.value) : INITIAL_DATA;
  } catch {
    return INITIAL_DATA;
  }
}

async function saveToStorage(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

async function askClaude(systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

export default function SelfOSApp() {
  const [entries, setEntries] = useState(INITIAL_DATA);
  const [activeCategory, setActiveCategory] = useState("personality");
  const [inputText, setInputText] = useState("");
  const [aiInsight, setAiInsight] = useState("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [view, setView] = useState("dashboard"); // dashboard | category | insight
  const [newEntryText, setNewEntryText] = useState("");
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [insightQuestion, setInsightQuestion] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [exportModal, setExportModal] = useState(false);
  const [exportText, setExportText] = useState("");
  const [copyStatus, setCopyStatus] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // { catId, entryId, raw, tag, summary }
  const [editText, setEditText] = useState("");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const textareaRef = useRef(null);
  const importRef = useRef(null);

  const handleExport = () => {
    const exportData = {
      version: "self-os-v1",
      exportedAt: new Date().toISOString(),
      entries,
    };
    setExportText(JSON.stringify(exportData, null, 2));
    setExportModal(true);
    setCopyStatus(false);
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2500);
    } catch {
      const el = document.getElementById("export-textarea");
      if (el) { el.select(); document.execCommand("copy"); }
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2500);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const data = parsed.entries || parsed;
        // Validate structure
        const hasValidKeys = CATEGORIES.every((cat) => Array.isArray(data[cat.id]));
        if (!hasValidKeys) throw new Error("invalid");
        setEntries(data);
        setImportStatus("success");
        setTimeout(() => setImportStatus(""), 3000);
      } catch {
        setImportStatus("error");
        setTimeout(() => setImportStatus(""), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => {
    loadFromStorage().then((data) => {
      setEntries(data);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveToStorage(entries);
  }, [entries, loaded]);

  const activeCat = CATEGORIES.find((c) => c.id === activeCategory);

  const addEntry = async () => {
    if (!newEntryText.trim()) return;
    setIsAddingEntry(true);

    const systemPrompt = `あなたは自己分析の専門家です。ユーザーが「${activeCat.label}」カテゴリに記録した内容を、簡潔で本質的なタグ（3〜5語）に変換してください。
返答はJSONのみ。形式: {"tag": "簡潔なラベル", "summary": "1〜2文の本質的な洞察"}`;

    try {
      const res = await askClaude(systemPrompt, newEntryText);
      const clean = res.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const entry = {
        id: Date.now(),
        raw: newEntryText,
        tag: parsed.tag || newEntryText.slice(0, 20),
        summary: parsed.summary || "",
        createdAt: new Date().toLocaleDateString("ja-JP"),
      };

      setEntries((prev) => ({
        ...prev,
        [activeCategory]: [...prev[activeCategory], entry],
      }));
      setNewEntryText("");
    } catch {
      const entry = {
        id: Date.now(),
        raw: newEntryText,
        tag: newEntryText.slice(0, 20),
        summary: "",
        createdAt: new Date().toLocaleDateString("ja-JP"),
      };
      setEntries((prev) => ({
        ...prev,
        [activeCategory]: [...prev[activeCategory], entry],
      }));
      setNewEntryText("");
    }
    setIsAddingEntry(false);
  };

  const removeEntry = (catId, entryId) => {
    setEntries((prev) => ({
      ...prev,
      [catId]: prev[catId].filter((e) => e.id !== entryId),
    }));
  };

  const startEdit = (catId, entry) => {
    setEditingEntry({ catId, entryId: entry.id });
    setEditText(entry.raw);
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingEntry) return;
    setIsReanalyzing(true);
    const cat = CATEGORIES.find((c) => c.id === editingEntry.catId);
    const systemPrompt = `あなたは自己分析の専門家です。ユーザーが「${cat.label}」カテゴリに記録した内容を、簡潔で本質的なタグ（3〜5語）に変換してください。
返答はJSONのみ。形式: {"tag": "簡潔なラベル", "summary": "1〜2文の本質的な洞察"}`;
    try {
      const res = await askClaude(systemPrompt, editText);
      const clean = res.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setEntries((prev) => ({
        ...prev,
        [editingEntry.catId]: prev[editingEntry.catId].map((e) =>
          e.id === editingEntry.entryId
            ? { ...e, raw: editText, tag: parsed.tag || editText.slice(0, 20), summary: parsed.summary || "" }
            : e
        ),
      }));
    } catch {
      setEntries((prev) => ({
        ...prev,
        [editingEntry.catId]: prev[editingEntry.catId].map((e) =>
          e.id === editingEntry.entryId ? { ...e, raw: editText, tag: editText.slice(0, 20) } : e
        ),
      }));
    }
    setEditingEntry(null);
    setEditText("");
    setIsReanalyzing(false);
  };

  const generateInsight = async () => {
    if (!insightQuestion.trim()) return;
    setIsLoadingAI(true);
    setView("insight");

    const allData = CATEGORIES.map((cat) => {
      const items = entries[cat.id];
      if (!items.length) return null;
      return `【${cat.label}】\n${items.map((e) => `- ${e.tag}: ${e.summary || e.raw}`).join("\n")}`;
    })
      .filter(Boolean)
      .join("\n\n");

    const systemPrompt = `あなたは深い自己理解を助けるコーチです。ユーザーの自己分析データを元に、鋭く、具体的で、思わず「そうだ」と思えるような洞察を提供してください。
表面的なことは言わず、パターンや矛盾、隠れた強みを見つけ出してください。
200〜300字程度で、日本語で答えてください。`;

    const userMsg = `私の自己分析データ:\n${allData || "（まだデータがありません）"}\n\n質問: ${insightQuestion}`;

    try {
      const res = await askClaude(systemPrompt, userMsg);
      setAiInsight(res);
    } catch {
      setAiInsight("AIとの接続に失敗しました。しばらくしてから試してください。");
    }
    setIsLoadingAI(false);
  };

  const totalEntries = Object.values(entries).flat().length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0F0E0C",
      color: "#E8E0D5",
      fontFamily: "'Georgia', 'Hiragino Mincho ProN', serif",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background texture */}
      <div style={{
        position: "fixed", inset: 0,
        backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(200,184,162,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(162,184,200,0.04) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(232,224,213,0.1)",
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky", top: 0,
        background: "rgba(15,14,12,0.92)",
        backdropFilter: "blur(12px)",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.3em", color: "#7A7066", textTransform: "uppercase" }}>Self</span>
          <span style={{ fontSize: 20, color: "#C8B8A2", fontStyle: "italic" }}>OS</span>
          <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "#7A7066" }}>v1.0</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["dashboard", "insight"].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? "rgba(200,184,162,0.12)" : "transparent",
              border: `1px solid ${view === v ? "rgba(200,184,162,0.3)" : "transparent"}`,
              color: view === v ? "#C8B8A2" : "#5A5248",
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 11,
              letterSpacing: "0.15em",
              cursor: "pointer",
              transition: "all 0.2s",
            }}>
              {v === "dashboard" ? "記録" : "洞察"}
            </button>
          ))}
        </div>
      </header>

      {/* Main */}
      <main style={{ padding: "28px 28px 100px", maxWidth: 680, margin: "0 auto" }}>

        {/* DASHBOARD VIEW */}
        {view === "dashboard" && (
          <>
            {/* Stats */}
            <div style={{
              display: "flex", gap: 12, marginBottom: 28,
              padding: "16px 20px",
              background: "rgba(232,224,213,0.03)",
              borderRadius: 12,
              border: "1px solid rgba(232,224,213,0.06)",
            }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 26, fontStyle: "italic", color: "#C8B8A2" }}>{totalEntries}</div>
                <div style={{ fontSize: 10, color: "#5A5248", letterSpacing: "0.2em" }}>TOTAL RECORDS</div>
              </div>
              {CATEGORIES.map((cat) => (
                <div key={cat.id} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 18, color: cat.color }}>{entries[cat.id].length}</div>
                  <div style={{ fontSize: 9, color: "#5A5248", letterSpacing: "0.1em" }}>{cat.label}</div>
                </div>
              ))}
            </div>

            {/* Export / Import */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button onClick={handleExport} style={{
                flex: 1,
                background: "rgba(232,224,213,0.04)",
                border: "1px solid rgba(232,224,213,0.08)",
                color: "#8A8078",
                borderRadius: 10,
                padding: "10px 0",
                fontSize: 11,
                letterSpacing: "0.15em",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.2s",
              }}>
                ↓ エクスポート
              </button>
              <button onClick={() => importRef.current?.click()} style={{
                flex: 1,
                background: "rgba(232,224,213,0.04)",
                border: "1px solid rgba(232,224,213,0.08)",
                color: importStatus === "success" ? "#A2C8B0" : importStatus === "error" ? "#C8A2A2" : "#8A8078",
                borderRadius: 10,
                padding: "10px 0",
                fontSize: 11,
                letterSpacing: "0.15em",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.2s",
              }}>
                {importStatus === "success" ? "✓ 読み込み完了" : importStatus === "error" ? "✗ 形式エラー" : "↑ インポート"}
              </button>
              <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
            </div>

            {/* Category selector */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 28 }}>
              {CATEGORIES.map((cat) => (
                <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setView("category"); }} style={{
                  background: "rgba(232,224,213,0.03)",
                  border: `1px solid rgba(232,224,213,0.07)`,
                  borderRadius: 12,
                  padding: "16px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                  color: "#E8E0D5",
                }}>
                  <div style={{ fontSize: 18, marginBottom: 6, color: cat.color }}>{cat.icon}</div>
                  <div style={{ fontSize: 13, marginBottom: 3 }}>{cat.label}</div>
                  <div style={{ fontSize: 10, color: "#5A5248" }}>{entries[cat.id].length} 件</div>
                </button>
              ))}
            </div>

            {/* Recent entries */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#5A5248", letterSpacing: "0.3em", marginBottom: 14 }}>RECENT</div>
              {Object.values(entries).flat().sort((a, b) => b.id - a.id).slice(0, 5).map((entry) => {
                const cat = CATEGORIES.find((c) => entries[c.id].some((e) => e.id === entry.id));
                return (
                  <div key={entry.id} style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(232,224,213,0.05)",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}>
                    <span style={{ color: cat?.color, fontSize: 12, marginTop: 2 }}>{cat?.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, marginBottom: 3 }}>{entry.tag}</div>
                      {entry.summary && <div style={{ fontSize: 11, color: "#5A5248", lineHeight: 1.5 }}>{entry.summary}</div>}
                    </div>
                    <span style={{ fontSize: 10, color: "#3A3530" }}>{entry.createdAt}</span>
                  </div>
                );
              })}
              {totalEntries === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#3A3530", fontSize: 13 }}>
                  まだ記録がありません。<br />
                  <span style={{ color: "#5A5248" }}>カテゴリを選んで自分を記録しましょう。</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* CATEGORY VIEW */}
        {view === "category" && (
          <>
            <button onClick={() => setView("dashboard")} style={{
              background: "none", border: "none", color: "#5A5248",
              fontSize: 11, letterSpacing: "0.2em", cursor: "pointer",
              marginBottom: 20, padding: 0, display: "flex", alignItems: "center", gap: 6,
            }}>
              ← ダッシュボード
            </button>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
              {CATEGORIES.map((cat) => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                  background: activeCategory === cat.id ? "rgba(232,224,213,0.08)" : "transparent",
                  border: `1px solid ${activeCategory === cat.id ? cat.color + "60" : "rgba(232,224,213,0.08)"}`,
                  color: activeCategory === cat.id ? cat.color : "#5A5248",
                  padding: "5px 14px",
                  borderRadius: 20,
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Input area */}
            <div style={{
              background: "rgba(232,224,213,0.03)",
              border: "1px solid rgba(232,224,213,0.08)",
              borderRadius: 14,
              padding: 20,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, color: "#7A7066", marginBottom: 10, letterSpacing: "0.2em" }}>
                {activeCat?.icon} {activeCat?.label} を記録する
              </div>
              <textarea
                ref={textareaRef}
                value={newEntryText}
                onChange={(e) => setNewEntryText(e.target.value)}
                placeholder={`${activeCat?.desc}について、思ったことをそのまま書いてください…`}
                style={{
                  width: "100%",
                  background: "rgba(232,224,213,0.04)",
                  border: "1px solid rgba(232,224,213,0.08)",
                  borderRadius: 8,
                  color: "#E8E0D5",
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: "12px 14px",
                  resize: "none",
                  minHeight: 100,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={addEntry} disabled={isAddingEntry || !newEntryText.trim()} style={{
                  background: isAddingEntry ? "rgba(200,184,162,0.1)" : "rgba(200,184,162,0.15)",
                  border: "1px solid rgba(200,184,162,0.25)",
                  color: "#C8B8A2",
                  padding: "8px 20px",
                  borderRadius: 20,
                  fontSize: 12,
                  cursor: isAddingEntry ? "wait" : "pointer",
                  letterSpacing: "0.1em",
                  transition: "all 0.2s",
                }}>
                  {isAddingEntry ? "AIが整理中…" : "記録する"}
                </button>
              </div>
            </div>

            {/* Entries list */}
            <div style={{ fontSize: 10, color: "#5A5248", letterSpacing: "0.3em", marginBottom: 14 }}>
              RECORDS — {entries[activeCategory]?.length || 0}件
            </div>
            {entries[activeCategory]?.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#3A3530", fontSize: 13 }}>
                まだ記録がありません
              </div>
            )}
            {entries[activeCategory]?.map((entry) => {
              const isEditing = editingEntry?.entryId === entry.id && editingEntry?.catId === activeCategory;
              return (
                <div key={entry.id} style={{
                  padding: "16px",
                  borderBottom: "1px solid rgba(232,224,213,0.05)",
                  position: "relative",
                }}>
                  {isEditing ? (
                    <div>
                      <div style={{ fontSize: 10, color: "#7A7066", letterSpacing: "0.2em", marginBottom: 8 }}>編集中</div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{
                          width: "100%",
                          background: "rgba(232,224,213,0.04)",
                          border: "1px solid rgba(200,184,162,0.2)",
                          borderRadius: 8,
                          color: "#E8E0D5",
                          fontSize: 13,
                          lineHeight: 1.7,
                          padding: "10px 12px",
                          resize: "none",
                          minHeight: 80,
                          outline: "none",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => { setEditingEntry(null); setEditText(""); }} style={{
                          background: "none", border: "1px solid rgba(232,224,213,0.1)",
                          color: "#5A5248", padding: "5px 14px", borderRadius: 16,
                          fontSize: 11, cursor: "pointer",
                        }}>キャンセル</button>
                        <button onClick={saveEdit} disabled={isReanalyzing || !editText.trim()} style={{
                          background: "rgba(200,184,162,0.12)",
                          border: "1px solid rgba(200,184,162,0.25)",
                          color: "#C8B8A2", padding: "5px 14px", borderRadius: 16,
                          fontSize: 11, cursor: isReanalyzing ? "wait" : "pointer",
                        }}>
                          {isReanalyzing ? "AI再分析中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: activeCat?.color, marginBottom: 4 }}>{entry.tag}</div>
                        {entry.summary && (
                          <div style={{ fontSize: 12, color: "#8A8078", lineHeight: 1.6, marginBottom: 6 }}>{entry.summary}</div>
                        )}
                        <details style={{ cursor: "pointer" }}>
                          <summary style={{ fontSize: 10, color: "#4A4540", listStyle: "none", letterSpacing: "0.1em" }}>原文を見る</summary>
                          <div style={{ fontSize: 11, color: "#5A5248", lineHeight: 1.7, marginTop: 6, paddingLeft: 8, borderLeft: "2px solid rgba(232,224,213,0.1)" }}>
                            {entry.raw}
                          </div>
                        </details>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginLeft: 12 }}>
                        <span style={{ fontSize: 9, color: "#3A3530" }}>{entry.createdAt}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => startEdit(activeCategory, entry)} style={{
                            background: "none", border: "none",
                            color: "#5A5248", cursor: "pointer", fontSize: 10,
                            padding: "2px 6px", letterSpacing: "0.05em",
                          }}>編集</button>
                          <button onClick={() => removeEntry(activeCategory, entry.id)} style={{
                            background: "none", border: "none",
                            color: "#3A3530", cursor: "pointer", fontSize: 11,
                            padding: "2px 6px",
                          }}>×</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* INSIGHT VIEW */}
        {view === "insight" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: "#5A5248", letterSpacing: "0.3em", marginBottom: 16 }}>AI INSIGHT</div>
              <p style={{ fontSize: 13, color: "#7A7066", lineHeight: 1.8, marginBottom: 24 }}>
                記録した自己分析データを元に、AIが深い洞察を提供します。
                気になることを何でも聞いてみてください。
              </p>
              <textarea
                value={insightQuestion}
                onChange={(e) => setInsightQuestion(e.target.value)}
                placeholder="例：私の強みと弱みのパターンは？　/　今の状況に向いている仕事は？　/　服装で気をつけるべきことは？"
                style={{
                  width: "100%",
                  background: "rgba(232,224,213,0.04)",
                  border: "1px solid rgba(232,224,213,0.1)",
                  borderRadius: 10,
                  color: "#E8E0D5",
                  fontSize: 13,
                  lineHeight: 1.7,
                  padding: "14px 16px",
                  resize: "none",
                  minHeight: 90,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  marginBottom: 12,
                }}
              />
              <button onClick={generateInsight} disabled={isLoadingAI || !insightQuestion.trim()} style={{
                background: "rgba(200,184,162,0.12)",
                border: "1px solid rgba(200,184,162,0.3)",
                color: "#C8B8A2",
                padding: "10px 24px",
                borderRadius: 24,
                fontSize: 12,
                cursor: isLoadingAI ? "wait" : "pointer",
                letterSpacing: "0.15em",
                width: "100%",
                transition: "all 0.2s",
              }}>
                {isLoadingAI ? "分析中…" : "AIに聞く"}
              </button>
            </div>

            {/* AI Response */}
            {isLoadingAI && (
              <div style={{ padding: "32px", textAlign: "center", color: "#5A5248", fontSize: 12, letterSpacing: "0.2em" }}>
                <div style={{ marginBottom: 12, fontSize: 20 }}>◈</div>
                thinking...
              </div>
            )}
            {aiInsight && !isLoadingAI && (
              <div style={{
                background: "rgba(200,184,162,0.05)",
                border: "1px solid rgba(200,184,162,0.12)",
                borderRadius: 14,
                padding: "24px 20px",
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 10, color: "#7A7066", letterSpacing: "0.3em", marginBottom: 14 }}>INSIGHT</div>
                <p style={{ fontSize: 14, lineHeight: 2, color: "#D8D0C5", margin: 0 }}>{aiInsight}</p>
              </div>
            )}

            {/* Summary of all data */}
            {totalEntries > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#5A5248", letterSpacing: "0.3em", marginBottom: 14 }}>YOUR DATA</div>
                {CATEGORIES.map((cat) => {
                  if (!entries[cat.id].length) return null;
                  return (
                    <div key={cat.id} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: cat.color, marginBottom: 8, letterSpacing: "0.15em" }}>
                        {cat.icon} {cat.label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {entries[cat.id].map((e) => (
                          <span key={e.id} style={{
                            background: "rgba(232,224,213,0.05)",
                            border: "1px solid rgba(232,224,213,0.08)",
                            borderRadius: 20,
                            padding: "3px 12px",
                            fontSize: 11,
                            color: "#8A8078",
                          }}>{e.tag}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(15,14,12,0.95)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(232,224,213,0.06)",
        display: "flex",
        justifyContent: "center",
        gap: 4,
        padding: "12px 20px 20px",
      }}>
        {[
          { id: "dashboard", label: "記録", icon: "◈" },
          { id: "category", label: "カテゴリ", icon: "◎" },
          { id: "insight", label: "洞察", icon: "◐" },
        ].map((nav) => (
          <button key={nav.id} onClick={() => setView(nav.id)} style={{
            flex: 1,
            maxWidth: 100,
            background: view === nav.id ? "rgba(200,184,162,0.1)" : "transparent",
            border: "none",
            color: view === nav.id ? "#C8B8A2" : "#4A4540",
            padding: "8px 4px",
            borderRadius: 10,
            fontSize: 10,
            cursor: "pointer",
            letterSpacing: "0.1em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 16 }}>{nav.icon}</span>
            {nav.label}
          </button>
        ))}
      </nav>

      {/* Export Modal */}
      {exportModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(10,9,8,0.85)",
          backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }} onClick={() => setExportModal(false)}>
          <div style={{
            background: "#1A1916",
            border: "1px solid rgba(232,224,213,0.1)",
            borderRadius: 16,
            padding: 24,
            width: "100%",
            maxWidth: 500,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "#7A7066", letterSpacing: "0.3em" }}>EXPORT DATA</div>
              <button onClick={() => setExportModal(false)} style={{ background: "none", border: "none", color: "#5A5248", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: "#5A5248", margin: 0, lineHeight: 1.7 }}>
              下のJSONをコピーして、テキストファイルに保存しておくとバックアップになります。
            </p>
            <textarea
              id="export-textarea"
              readOnly
              value={exportText}
              style={{
                flex: 1,
                minHeight: 200,
                background: "rgba(232,224,213,0.03)",
                border: "1px solid rgba(232,224,213,0.08)",
                borderRadius: 8,
                color: "#6A6460",
                fontSize: 11,
                fontFamily: "monospace",
                padding: "12px",
                resize: "none",
                outline: "none",
              }}
            />
            <button onClick={handleCopyExport} style={{
              background: copyStatus ? "rgba(162,200,176,0.15)" : "rgba(200,184,162,0.12)",
              border: `1px solid ${copyStatus ? "rgba(162,200,176,0.3)" : "rgba(200,184,162,0.25)"}`,
              color: copyStatus ? "#A2C8B0" : "#C8B8A2",
              padding: "10px",
              borderRadius: 10,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: "0.15em",
              transition: "all 0.3s",
            }}>
              {copyStatus ? "✓ コピーしました" : "クリップボードにコピー"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
