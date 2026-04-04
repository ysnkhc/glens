"use client";

import React from "react";
import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  code: string;
  onChange: (value: string) => void;
}

export default function CodeEditor({ code, onChange }: CodeEditorProps) {
  return (
    <div className="monaco-wrapper h-full">
      <Editor
        height="100%"
        defaultLanguage="python"
        theme="vs-dark"
        value={code}
        onChange={(val) => onChange(val || "")}
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
    </div>
  );
}
