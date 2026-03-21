// ============================================================
// useTheme.js
// NexaSense — Single unified theme system
// Uses Tailwind darkMode: "class" — adds/removes "dark" on <html>
// Persists in localStorage
// ============================================================

import { useEffect, useState } from "react";

export default function useTheme() {

  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme(prev => prev === "dark" ? "light" : "dark");

  return { theme, toggleTheme };
}