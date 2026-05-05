"use client";

import React, { useState, useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Use local monaco-editor instead of CDN to avoid network hangs
loader.config({ monaco });

const MONACO_TIMEOUT_MS = 8000;

interface CodeEditorProps {
  code: string;
  onChange: (value: string) => void;
}

// ─── Textarea fallback (dark-themed, full-featured) ─────────────
function TextareaFallback({ code, onChange }: CodeEditorProps) {
  return (
    <textarea
      value={code}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="w-full h-full resize-none outline-none"
      style={{
        background: "#0b0e16",
        color: "#d4d4d4",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 14,
        lineHeight: 1.6,
        padding: "16px",
        tabSize: 4,
        border: "none",
        caretColor: "#4ade80",
      }}
    />
  );
}

export default function CodeEditor({ code, onChange }: CodeEditorProps) {
  const [monacoReady, setMonacoReady] = useState(false);
  const [monacoFailed, setMonacoFailed] = useState(false);
  const mountedRef = useRef(false);

  // Timeout: if Monaco doesn't mount within MONACO_TIMEOUT_MS, fall back
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mountedRef.current) {
        console.warn(`[CodeEditor] Monaco did not load within ${MONACO_TIMEOUT_MS}ms — falling back to textarea`);
        setMonacoFailed(true);
      }
    }, MONACO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // If Monaco failed, render textarea
  if (monacoFailed) {
    return (
      <div className="monaco-wrapper h-full">
        <TextareaFallback code={code} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="monaco-wrapper h-full">
      <Editor
        height="100%"
        defaultLanguage="python"
        theme="vs-dark"
        value={code}
        onChange={(val) => onChange(val || "")}
        onMount={() => {
          mountedRef.current = true;
          setMonacoReady(true);
        }}
        loading={
          <div className="w-full h-full flex items-center justify-center" style={{ background: "#0b0e16" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading editor…</span>
            </div>
          </div>
        }
        options={{
          fontSize: 14,
          fontFamily: "var(--font-mono), 'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 16 },
          lineNumbers: "on",
          renderLineHighlight: "gutter",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: "on",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true },
        }}
      />
      {/* Screen-reader only status */}
      {!monacoReady && <span className="sr-only">Editor loading</span>}
    </div>
  );
}
