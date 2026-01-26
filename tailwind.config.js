/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/web/**/*.{html,js,ts,eta}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', 'sans-serif'],
        display: ['"Clash Display"', 'sans-serif']
      },
      colors: {
        // Custom deep space palette
        space: {
          950: '#0B0C15',
          900: '#151725',
          800: '#23263A',
          700: '#343852',
        },
        accent: {
          400: '#8B5CF6', // Violet
          500: '#7C3AED',
          600: '#6D28D9',
        },
        brand: {
          400: '#F472B6', // Pink
          500: '#EC4899',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
