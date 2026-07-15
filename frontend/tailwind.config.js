module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      colors: {
        app: "#0A0A0A",
        panel: "#141414",
        header: "#1A1A1A",
        line: "#27272A",
        lineActive: "#3F3F46",
        accent: "#007AFF",
        playhead: "#FF3B30",
      },
    },
  },
  plugins: [],
};
