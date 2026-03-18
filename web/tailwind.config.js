/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#1a1a2e',
          accent: '#e94560',
        },
      },
    },
  },
  plugins: [],
}
