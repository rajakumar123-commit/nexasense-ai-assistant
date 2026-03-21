// ============================================================
// tailwind.config.js — NexaSense
// ============================================================

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",

  content: [
  "./index.html",
  "./src/**/*.{js,jsx,ts,tsx}",
],

  theme: {
    extend: {

      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['Fira Code', 'Consolas', 'monospace'],
        sans:    ['DM Sans', 'sans-serif'],
      },

      colors: {
        'bg-primary':   '#07070f',
        'bg-secondary': '#0e0e1a',
        'bg-card':      '#13131e',
        'bg-hover':     '#1a1a28',
        'border-default': '#252535',
        'border-light':   '#30304a',
        'text-primary':   '#eeeeff',
        'text-secondary': '#8080a8',
        'text-muted':     '#50506a',
        accent: {
          DEFAULT: '#6c63ff',
          hover:   '#7c73ff',
          2:       '#a78bfa',
          3:       '#38bdf8',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error:   '#ef4444',
        info:    '#38bdf8',
      },

      borderRadius: {
        'sm':  '6px',
        'md':  '10px',
        'lg':  '16px',
        'xl':  '24px',
        '2xl': '32px',
      },

      boxShadow: {
        'card':   '0 4px 24px rgba(0,0,0,0.5)',
        'accent': '0 0 40px rgba(108,99,255,0.3)',
        'glow-sm':'0 0 16px rgba(108,99,255,0.2)',
        'glow-lg':'0 0 40px rgba(108,99,255,0.4)',
      },

      // ── FIX: Add transitionDelay utilities ────────────────
      transitionDelay: {
        '0':   '0ms',
        '75':  '75ms',
        '100': '100ms',
        '150': '150ms',   // ← used by typing dots
        '200': '200ms',
        '300': '300ms',   // ← used by typing dots
        '500': '500ms',
        '700': '700ms',
        '1000':'1000ms',
      },

      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth':    'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
      },

      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // ── FIX: typing-bounce used by animate-typing ────────
        'typing-bounce': {
          '0%, 100%': { transform: 'translateY(0)',    opacity: '0.4' },
          '50%':      { transform: 'translateY(-6px)', opacity: '1'   },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'spin-slow': {
          'to': { transform: 'rotate(360deg)' },
        },
        'toast-in': {
          '0%':   { opacity: '0', transform: 'translateY(20px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'progress-flow': {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },

      animation: {
        'fade-in':    'fade-in 0.35s ease forwards',
        'slide-up':   'slide-up 0.4s ease forwards',
        'scale-in':   'scale-in 0.3s ease forwards',
        'spin-slow':  'spin-slow 2s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease infinite',
        'shimmer':    'shimmer 1.8s ease infinite',
        'toast-in':   'toast-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'progress':   'progress-flow 2s linear infinite',
        // ── FIX: animate-typing now correctly maps ───────────
        'typing':     'typing-bounce 1.2s ease infinite',
      },

      backdropBlur: {
        'xs': '2px', 'sm': '4px', 'md': '8px',
        'lg': '12px', 'xl': '16px', '2xl': '24px',
      },

      zIndex: {
        '60': '60', '70': '70', '80': '80', '90': '90', '100': '100',
      },

      screens: {
        'xs':  '480px',
        'sm':  '640px',
        'md':  '768px',
        'lg':  '1024px',
        'xl':  '1280px',
        '2xl': '1536px',
      },
    },
  },

  plugins: [],
};