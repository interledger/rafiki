/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        polkadot: 'url("public/polkadot-backdrop.svg")'
      },
      colors: {
        pearl: '#eee6e2',
        'off-white': '#fbf7f4',
        wafer: '#e3d7d0',
        mercury: '#e2e2e2'
      }
    }
  },
  plugins: []
}
