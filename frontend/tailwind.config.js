/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAFA",
        surface: "#FFFFFF",
        ink: "#111111",
        muted: "#6B7280",
        line: "#E5E7EB",
        ok: "#16A34A",
        warn: "#F59E0B",
        danger: "#DC2626",
        accent: "#2563EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
        pop: "0 10px 30px rgba(0,0,0,0.12)",
      },
      borderRadius: { xl: "0.875rem" },
    },
  },
  plugins: [],
};
