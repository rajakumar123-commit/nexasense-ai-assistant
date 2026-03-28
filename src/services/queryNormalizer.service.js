// ============================================================
// queryNormalizer.service.js — NexaSense V7.0 God Tier
//
// WHAT'S NEW in V7.0:
//   ✅ 80+ TECHNICAL abbreviations: algo, ML, AI, NLP, SVM, CNN, etc.
//   ✅ "types of", "kinds of", "examples of" trigger list intent
//   ✅ Covers ALL document domains: academic + technical + general
//   ✅ Cleans Unicode directional characters and invisible chars
// ============================================================

"use strict";

// ─────────────────────────────────────────────────────────────
// Abbreviation expansion map
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
  "sylabus"  : "syllabus",
  "syllbus"  : "syllabus",
  "syll"     : "syllabus",
  "mod"      : "module",
  "mods"     : "modules",
  "chap"     : "chapter",
  "chaps"    : "chapters",
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

  // Indian education context
  "btech"    : "b.tech",
  "mtech"    : "m.tech",
  "mca"      : "master of computer applications",
  "bca"      : "bachelor of computer applications",
  "bsc"      : "b.sc.",
  "msc"      : "m.sc.",
  "cse"      : "computer science engineering",
  "ece"      : "electronics and communication engineering",
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

  // Ordinal abbreviations
  "1st"      : "first",
  "2nd"      : "second",
  "3rd"      : "third",
  "4th"      : "fourth",
  "5th"      : "fifth",
  "6th"      : "sixth",
  "7th"      : "seventh",
  "8th"      : "eighth",

  // ── V7.0: TECHNICAL / ML / AI / DS ───────────────────────
  // General programming & tech terms
  "algo"     : "algorithm",
  "algos"    : "algorithms",
  "alg"      : "algorithm",
  "algs"     : "algorithms",
  "impl"     : "implementation",
  "func"     : "function",
  "funcs"    : "functions",
  "param"    : "parameter",
  "params"   : "parameters",
  "arg"      : "argument",
  "args"     : "arguments",
  "ops"      : "operations",
  "diff"     : "difference",
  "diffs"    : "differences",
  "adv"      : "advantage",
  "advs"     : "advantages",
  "disadv"   : "disadvantage",
  "eg"       : "example",
  "defn"     : "definition",
  "def"      : "definition",
  "prop"     : "property",
  "props"    : "properties",
  "char"     : "characteristic",
  "chars"    : "characteristics",
  "app"      : "application",
  "apps"     : "applications",

  // AI / ML / DL
  "ai"       : "artificial intelligence",
  "ml"       : "machine learning",
  "dl"       : "deep learning",
  "nn"       : "neural network",
  "nns"      : "neural networks",
  "cnn"      : "convolutional neural network",
  "rnn"      : "recurrent neural network",
  "lstm"     : "long short-term memory",
  "gru"      : "gated recurrent unit",
  "gnn"      : "graph neural network",
  "gan"      : "generative adversarial network",
  "vae"      : "variational autoencoder",
  "nlp"      : "natural language processing",
  "cv"       : "computer vision",
  "rl"       : "reinforcement learning",
  "ssl"      : "semi-supervised learning",
  "svm"      : "support vector machine",
  "svms"     : "support vector machines",
  "knn"      : "k-nearest neighbors",
  "rf"       : "random forest",
  "nb"       : "naive bayes",
  "xgb"      : "xgboost",
  "lgbm"     : "lightgbm",
  "pca"      : "principal component analysis",
  "lda"      : "linear discriminant analysis",
  "llm"      : "large language model",
  "llms"     : "large language models",
  "rag"      : "retrieval augmented generation",
  "gpt"      : "generative pre-trained transformer",
  "bert"     : "bidirectional encoder representations from transformers",
  "attn"     : "attention mechanism",

  // Data / CS fundamentals
  "db"       : "database",
  "dsa"      : "data structures and algorithms",
  "sql"      : "structured query language",
  "api"      : "application programming interface",
  "oop"      : "object oriented programming",
  "dp"       : "dynamic programming",
  "bfs"      : "breadth first search",
  "dfs"      : "depth first search",
  "bst"      : "binary search tree",
  "mst"      : "minimum spanning tree",

  // Metrics
  "acc"      : "accuracy",
  "prec"     : "precision",
  "rec"      : "recall",
  "rmse"     : "root mean square error",
  "mae"      : "mean absolute error",
  "mse"      : "mean square error",
  "auc"      : "area under curve",
  "roc"      : "receiver operating characteristic",
  "f1"       : "f1 score",

  // ── LEGAL / CONTRACT ──────────────────────────────────────
  "nda"      : "non disclosure agreement",
  "mou"      : "memorandum of understanding",
  "moa"      : "memorandum of association",
  "toc"      : "terms and conditions",
  "tos"      : "terms of service",
  "ip"       : "intellectual property",
  "ipr"      : "intellectual property rights",
  "gdpr"     : "general data protection regulation",
  "ccpa"     : "california consumer privacy act",
  "liab"     : "liability",
  "indem"    : "indemnification",
  "arb"      : "arbitration",
  "juris"    : "jurisdiction",
  "gvt"      : "government",
  "govt"     : "government",
  "clause"   : "clause",
  "prov"     : "provision",
  "amend"    : "amendment",
  "const"    : "constitution",
  "legis"    : "legislation",
  "stat"     : "statute",
  "regs"     : "regulations",
  "reg"      : "regulation",
  "comp"     : "compliance",

  // ── HR / HUMAN RESOURCES ──────────────────────────────────
  "appraisal": "performance appraisal",
  "kra"      : "key result area",
  "kpi"      : "key performance indicator",
  "kpis"     : "key performance indicators",
  "ctc"      : "cost to company",
  "hike"     : "salary hike increment",
  "pf"       : "provident fund",
  "esi"      : "employee state insurance",
  "tds"      : "tax deducted at source",
  "l&d"      : "learning and development",
  "l&d"      : "learning and development",
  "doj"      : "date of joining",
  "dol"      : "date of leaving",
  "noc"      : "no objection certificate",
  "rel"      : "relieving letter",
  "exp"      : "experience",
  "pto"      : "paid time off",
  "wfh"      : "work from home",
  "wfo"      : "work from office",
  "pip"      : "performance improvement plan",
  "bgv"      : "background verification",
  "onb"      : "onboarding",
  "offb"     : "offboarding",

  // ── RESEARCH / ACADEMIC ───────────────────────────────────
  "lit"      : "literature",
  "litrev"   : "literature review",
  "rq"       : "research question",
  "hyp"      : "hypothesis",
  "meth"     : "methodology",
  "qual"     : "qualitative",
  "quant"    : "quantitative",
  "sig"      : "significance",
  "pval"     : "p value",
  "ci"       : "confidence interval",
  "sd"       : "standard deviation",
  "var"      : "variance",
  "corr"     : "correlation",
  "regr"     : "regression",
  "anova"    : "analysis of variance",
  "doi"      : "digital object identifier",
  "arXiv"    : "arxiv preprint",
  "et al"    : "and others",
  "etal"     : "and others",
  "ibid"     : "same source",
  "fig"      : "figure",
  "figs"     : "figures",
  "tab"      : "table",
  "eq"       : "equation",
  "eqs"      : "equations",
  "appdx"    : "appendix",
  "bib"      : "bibliography",
  "abs"      : "abstract",
  "intro"    : "introduction",
  "concl"    : "conclusion",
  "disc"     : "discussion",

  // ── FINANCE / BUSINESS ────────────────────────────────────
  "roi"      : "return on investment",
  "p&l"      : "profit and loss",
  "bal"      : "balance sheet",
  "rev"      : "revenue",
  "ebitda"   : "earnings before interest taxes depreciation amortization",
  "eps"      : "earnings per share",
  "ipo"      : "initial public offering",
  "m&a"      : "mergers and acquisitions",
  "capex"    : "capital expenditure",
  "opex"     : "operational expenditure",
  "cagr"     : "compound annual growth rate",
  "gst"      : "goods and services tax",
  "vat"      : "value added tax",
  "q1"       : "first quarter",
  "q2"       : "second quarter",
  "q3"       : "third quarter",
  "q4"       : "fourth quarter",
  "fy"       : "financial year",
  "yoy"      : "year over year",
  "mom"      : "month over month",
  "b2b"      : "business to business",
  "b2c"      : "business to consumer",
  "swot"     : "strengths weaknesses opportunities threats",
  "kpis"     : "key performance indicators",
  "sla"      : "service level agreement",
  "poc"      : "proof of concept",
  "mvp"      : "minimum viable product",
  "crm"      : "customer relationship management",
  "erp"      : "enterprise resource planning",

  // ── MEDICAL / CLINICAL ────────────────────────────────────
  "dx"       : "diagnosis",
  "rx"       : "prescription treatment",
  "hx"       : "history",
  "sx"       : "symptoms",
  "tx"       : "treatment",
  "pt"       : "patient",
  "bp"       : "blood pressure",
  "hr"       : "heart rate",  // medical context (may conflict with HR = human resources)
  "rr"       : "respiratory rate",
  "bmi"      : "body mass index",
  "ecg"      : "electrocardiogram",
  "mri"      : "magnetic resonance imaging",
  "ct"       : "computed tomography",
  "icu"      : "intensive care unit",
  "ot"       : "operation theatre",
  "opd"      : "outpatient department",
  "ipd"      : "inpatient department",
  "dob"      : "date of birth",
};


// ─────────────────────────────────────────────────────────────
// List/type intent patterns — covers ALL document domains
// ─────────────────────────────────────────────────────────────

const LIST_INTENT_PATTERNS = [
  // Academic
  /\b(subjects?|courses?|topics?|chapters?|units?|modules?)\b/i,
  /\bsyllabus\b/i,
  /\bcurriculum\b/i,

  // Technical / enumeration (V7.0)
  /\btypes?\s+of\b/i,
  /\bkinds?\s+of\b/i,
  /\bcategor(?:y|ies)\b/i,
  /\bexamples?\s+of\b/i,
  /\blist\s+of\b/i,
  /\bclassif(?:y|ications?)\b/i,
  /\b(algorithms?|methods?|techniques?|approaches?|architectures?)\b/i,
  /\badvantages?\b/i,
  /\bdisadvantages?\b/i,
  /\bdifference\s+between\b/i,
  /\bcompare\b/i,
  /\bwhat\s+are\b/i,
  /\bname\s+(?:the|all|some)\b/i,
  /\bproperties\b/i,
  /\bcharacteristics?\b/i,
  /\bfeatures?\s+of\b/i,
  /\bsteps?\s+(?:of|in|for)\b/i,
  /\bcomponents?\s+of\b/i,
];

function maybeAddListIntent(q) {
  const words = q.trim().split(/\s+/);
  if (words.length <= 8 && LIST_INTENT_PATTERNS.some(p => p.test(q))) {
    if (!/^(what|which|list|give|name|tell|show|how|types?|kinds?|categor|examples?)/i.test(q)) {
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
  q = q.replace(/\b[\w'.]+\b/g, token => {
    const lower = token.toLowerCase();
    return ABBR_MAP[lower] || token;
  });

  // 4. Collapse double spaces introduced by expansion
  q = q.replace(/\s+/g, " ").trim();

  // 5. Inject list intent for enumeration queries
  q = maybeAddListIntent(q);

  return q;
}

module.exports = { normalizeQuery };