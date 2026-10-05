export function ThemeBackdrop() {
  return (
    <div className="theme-backdrop" aria-hidden="true">
      <svg
        className="theme-silhouette"
        viewBox="0 0 280 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#soft-glow)">
          <path
            d="M142 46c18 8 32 28 28 50-3 16-16 28-30 32-8 18-6 38 4 54 8-6 20-8 30-2 14 8 18 28 8 40-8 10-22 12-34 8 2 22 8 44 8 66 0 28-10 54-18 80-6 18-8 38-4 56 10 38 28 72 28 110 0 22-10 48-32 56-18 6-40 2-52-12-16-18-14-48-4-68 8-16 14-34 12-52-4-28-18-52-22-80-6-36 2-72 10-106-14 6-30 4-40-8-12-14-8-36 6-46 12-8 28-6 38 4 6-18 8-38 2-56-14-4-26-16-28-32-4-22 12-44 32-52 8-22 36-36 58-32Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <filter
            id="soft-glow"
            x="-40"
            y="-20"
            width="360"
            height="620"
            filterUnits="userSpaceOnUse"
          >
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
