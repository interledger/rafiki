/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        polkadot: 'url("public/bg.webp")'
      },
      colors: {
        pearl: '#eee6e2',
        offwhite: '#fbf7f4',
        wafer: '#e3d7d0',
        mercury: '#e2e2e2',
        tealish: '#1e3250',
        vermillion: '#c94343'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
}
