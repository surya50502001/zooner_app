// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6750A4",
          "50": "#F5F2FF",
          "100": "#EDE9FE",
          "200": "#D7CFF9",
          "300": "#C2B8F5",
          "400": "#AFA1F0",
          "500": "#9C8EEB",
          "600": "#886CE5",
          "700": "#7548DF",
          "800": "#6213D8",
          "900": "#4F00CF",
        },
        secondary: {
          DEFAULT: "#FFB949",
          "50": "#FFF9E6",
          "100": "#FFECB3",
          "200": "#FFE082",
          "300": "#FFD54F",
          "400": "#FFCA28",
          "500": "#FFC107",
          "600": "#FFB300",
          "700": "#FFAA00",
          "800": "#FF9F00",
          "900": "#FF9100",
        },
        error: {
          DEFAULT: "#B00020",
        },
        background: {
          DEFAULT: "#FAFAFA",
        },
        surface: {
          DEFAULT: "#FFFFFF",
        },
        onPrimary: {
          DEFAULT: "#FFFFFF",
        },
        onSecondary: {
          DEFAULT: "#000000",
        },
        onSurface: {
          DEFAULT: "#000000",
        },
      },
      borderRadius: {
        btn: "0.5rem",
        card: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
        btn: "0 2px 4px rgba(0,0,0,0.15)",
      },
    },
  },
  plugins: [],
};
