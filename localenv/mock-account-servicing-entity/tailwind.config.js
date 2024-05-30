/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pearl: '#eee6e2',
        offwhite: '#fbf7f4',
        wafer: '#e3d7d0',
        mercury: '#e2e2e2',
        tealish: '#1e3250',
        vermillion: '#c94343',
        main_blue: '#3533A0',
        secondary_blue: '#5553a5'
      },
      backgroundImage: {
        wallet: "url('/wallet-background.png')",
        bank: "url('/bank-background.png')"
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
}
