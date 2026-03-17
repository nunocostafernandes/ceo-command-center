/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'var(--bg-base)',
        foreground: 'var(--text-primary)',
        accent: {
          DEFAULT: '#5E6AD2',
          hover: '#6B78D8',
          muted: 'rgba(94,106,210,0.15)',
          foreground: '#ffffff',
        },
        card: {
          DEFAULT: 'rgba(255,255,255,0.05)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          foreground: 'var(--text-secondary)',
        },
        border: 'rgba(255,255,255,0.08)',
        input: 'rgba(255,255,255,0.08)',
        ring: '#5E6AD2',
        primary: {
          DEFAULT: '#5E6AD2',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          foreground: 'var(--text-primary)',
        },
        destructive: {
          DEFAULT: '#F87171',
          foreground: '#ffffff',
        },
        popover: {
          DEFAULT: '#0f0f12',
          foreground: 'var(--text-primary)',
        },
        surface: {
          base: '#020203',
          elevated: '#0a0a0c',
          card: 'rgba(255,255,255,0.05)',
        },
        text: {
          primary: 'rgba(255,255,255,0.92)',
          secondary: 'rgba(255,255,255,0.55)',
          tertiary: 'rgba(255,255,255,0.30)',
        },
        status: {
          success: '#34D399',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
        },
        priority: {
          urgent: '#F87171',
          high: '#FBBF24',
          medium: '#60A5FA',
          low: 'rgba(255,255,255,0.30)',
        },
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        card: '16px',
        btn: '999px',
        sheet: '24px',
      },
      backdropBlur: {
        glass: '20px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'fade-up': 'fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
