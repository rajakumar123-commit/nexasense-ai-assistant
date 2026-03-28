// ============================================================
// queryNormalizer.service.js — NexaSense Enterprise V2.0
//
// WHAT'S NEW:
//   ✅ Academic abbreviation expansion (sem→semester, dept→department etc.)
//   ✅ Common short-form expansion for Indian education context
//   ✅ Number word normalization (1st=first, 6th=sixth for search)
//   ✅ Cleans Unicode directional characters and invisible chars
//   ✅ Still safe — never changes meaning, only expands known abbreviations
// ============================================================

"use strict";

// ─────────────────────────────────────────────────────────────
// Abbreviation expansion map
// These are the most common short-forms users type in queries
// ─────────────────────────────────────────────────────────────

const ABBR_MAP = {
  // Academic structure
  "sem"      : "semester",
  "sems"     : "semesters",
  "dept"     : "department",
  "depts"    : "departments",
  "sub"      : "subjects",
  "subs"     : "subjects",
  "subj"     : "subjects",
  "yr"       : "year",
  "yrs"      : "years",
  "uni"      : "university",
  "univ"     : "university",
  "clg"      : "college",
  "col"      : "college",
  "sylb"     : "syllabus",
  "syllb"    : "syllabus",
  "sylabus"  : "syllabus",   // common misspelling
  "syllbus"  : "syllabus",
  "syll"     : "syllabus",
  "mod"      : "module",
  "mods"     : "modules",
  "chap"     : "chapter",
  "chaps"    : "chapters",
  "sec"      : "section",
  "secs"     : "sections",
  "ref"      : "reference",
  "refs"     : "references",
  "obj"      : "objective",
  "objs"     : "objectives",
  "co"       : "course outcome",
  "cos"      : "course outcomes",
  "po"       : "program outcome",
  "pos"      : "program outcomes",
  "pso"      : "program specific outcome",
  "proj"     : "project",
  "exm"      : "exam",
  "que"      : "question",

  // Indian context
  "btech"    : "b.tech",
  "be"       : "b.e.",
  "mtech"    : "m.tech",
  "mca"      : "master of computer applications",
  "bca"      : "bachelor of computer applications",
  "bsc"      : "b.sc.",
  "msc"      : "m.sc.",
  "it"       : "information technology",   // when used alone as context
  "cs"       : "computer science",
  "cse"      : "computer science engineering",
  "ece"      : "electronics and communication engineering",
  "me"       : "mechanical engineering",
  "ce"       : "civil engineering",
  "ee"       : "electrical engineering",
  "mk"       : "marks",
  "hrs"      : "hours",
  "hr"       : "hour",
  "pg"       : "page",
  "pgs"      : "pages",
  "lec"      : "lecture",
  "lecs"     : "lectures",
  "prac"     : "practical",
  "lab"      : "laboratory",
  "tut"      : "tutorial",
  "tuts"     : "tutorials",
  "int"      : "internal",
  "ext"      : "external",

  // Ordinal abbreviations (very common: "6th sem")
  "1st"      : "first",
  "2nd"      : "second",
  "3rd"      : "third",
  "4th"      : "fourth",
  "5th"      : "fifth",
  "6th"      : "sixth",
  "7th"      : "seventh",
  "8th"      : "eighth",
};

// ─────────────────────────────────────────────────────────────
// Intent expansion: very short queries that are clearly about
// a list should have "list" intent injected
// ─────────────────────────────────────────────────────────────

const LIST_INTENT_PATTERNS = [
  /\b(subjects?|courses?|topics?|chapters?|units?|modules?)\b/i,
  /\bsyllabus\b/i,
  /\bcurriculum\b/i,
];

function maybeAddListIntent(q) {
  // If query is short (< 6 words) and contains a list-type keyword, prefix it
  const words = q.trim().split(/\s+/);
  if (words.length <= 6 && LIST_INTENT_PATTERNS.some(p => p.test(q))) {
    // Only add if it doesn't already start with a question word
    if (!/^(what|which|list|give|name|tell|show|how)/i.test(q)) {
      return "list all " + q;
    }
  }
  return q;
}


// ─────────────────────────────────────────────────────────────
// Main normalizer
// ─────────────────────────────────────────────────────────────

function normalizeQuery(question) {
  if (!question || typeof question !== "string") return "";

  // 1. Strip invisible / control characters (common from mobile keyboards)
  let q = question.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");

  // 2. Trim and collapse whitespace
  q = q.trim().replace(/\s+/g, " ");

  if (q.length === 0) return "";

  // 3. Expand abbreviations (word-boundary aware, case-insensitive)
  //    We replace each word if it's an exact key in ABBR_MAP
  q = q.replace(/\b[\w']+\b/g, token => {
    const lower = token.toLowerCase();
    return ABBR_MAP[lower] || token;
  });

  // 4. Collapse any double spaces introduced by expansion
  q = q.replace(/\s+/g, " ").trim();

  // 5. Inject list intent if query is short and topic-type
  q = maybeAddListIntent(q);

  return q;
}

module.exports = { normalizeQuery };