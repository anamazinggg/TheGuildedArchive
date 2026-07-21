/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf8f0',
          100: '#f9edda',
          200: '#f2d8b0',
          300: '#e9be7d',
          400: '#e0a34e',
          500: '#d48a2c',
          600: '#c06e20',
          700: '#a0531d',
          800: '#82431f',
          900: '#6a381c',
          950: '#3a1b0d',
        },
      },
      fontFamily: {
        serif: ['Merriweather', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
