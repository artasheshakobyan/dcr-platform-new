/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080E1C',
        card: '#0F1824',
        card2: '#162030',
        border: '#1E2D42',
        teal: '#00D4B8',
        muted: '#4B6280',
        dim: '#8BA3BE',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
