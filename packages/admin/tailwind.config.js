/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        polkadot: 'url("public/polkadot-backdrop.svg")'
      }
    }
  },
  plugins: []
}
