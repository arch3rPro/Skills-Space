import { useEffect, useMemo, useState } from "react"
import type { loadHighlighter } from "@/lib/highlighter"

type Loaded = Awaited<ReturnType<typeof loadHighlighter>>

export function useHighlightedCode(code: string, language: string) {
  const [loaded, setLoaded] = useState<{ language: string; highlighter: Loaded } | null>(null)
  useEffect(() => {
    let cancelled = false
    import("@/lib/highlighter").then(module => module.loadHighlighter(language)).then(highlighter => {
      if (!cancelled) setLoaded({ language, highlighter })
    }).catch(() => { /* Keep readable plain text if highlighting is unavailable. */ })
    return () => { cancelled = true }
  }, [language])

  const highlighter = loaded?.language === language ? loaded.highlighter : null
  return useMemo(() => {
    try { return highlighter?.highlight(code).lines ?? code.split("\n") }
    catch { return code.split("\n") }
  }, [code, highlighter])
}
