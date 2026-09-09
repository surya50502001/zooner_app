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
        apple: {
          blue: '#007AFF',
          'blue-hover': '#0071E3',
          green: '#34C759',
          red: '#FF3B30',
          orange: '#FF9500',
          yellow: '#FFCC00',
          teal: '#5AC8FA',
          indigo: '#5856D6',
          pink: '#FF2D55',
          gray1: '#8E8E93',
          gray2: '#AEAEB2',
          gray3: '#C7C7CC',
          gray4: '#D1D1D6',
          gray5: '#E5E5EA',
          gray6: '#F2F2F7',
          bg: '#F5F5F7',
          label: '#1D1D1F',
          secondaryLabel: '#3A3A3C',
          tertiaryLabel: '#86868B',
        },
        primary: {
          DEFAULT: "#007AFF",
          "50": "#E5F2FF",
          "100": "#CCE5FF",
          "200": "#99CBFF",
          "300": "#66B2FF",
          "400": "#3399FF",
          "500": "#007AFF",
          "600": "#0071E3",
          "700": "#005BB5",
          "800": "#004487",
          "900": "#002E59",
        },
        secondary: {
          DEFAULT: "#FF9500",
        },
        background: {
          DEFAULT: "#F5F5F7",
        },
        surface: {
          DEFAULT: "#FFFFFF",
        },
        onPrimary: {
          DEFAULT: "#FFFFFF",
        },
        onSurface: {
          DEFAULT: "#1D1D1F",
        },
      },
      fontFamily: {
        apple: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        'apple-sm': '8px',
        'apple-md': '12px',
        'apple-lg': '16px',
        'apple-xl': '20px',
        'apple-2xl': '28px',
        btn: '12px',
        card: '16px',
      },
      boxShadow: {
        'apple-card': '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        'apple-nav': '0 0.5px 0 rgba(0,0,0,0.12)',
        'apple-modal': '0 4px 40px rgba(0,0,0,0.10)',
        card: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        btn: '0 2px 8px rgba(0,122,255,0.25)',
      },
    },
  },
  plugins: [],
};

