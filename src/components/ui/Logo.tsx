"use client";

/**
 * Chess Masti — Bullseye Logo
 * ---------------------------
 * The bishop's four turned sections (finial dot + 2 rings + base) as concentric
 * circles. Pure single-color SVG. Scales crisply to any size.
 *
 *   <Logo />                       // 40px "rings" mark, brand orange
 *   <Logo variant="bold" />        // chunky two-band version
 *   <Logo size={28} color="#0A0A0A" />  // for use on an orange tile
 */
export function Logo({
  size = 40,
  color = "#F97316",
  variant = "rings",
  title = "Chess Masti",
}: {
  size?: number;
  color?: string;
  variant?: "rings" | "bold";
  title?: string;
}) {
  const sw = variant === "bold" ? 13 : 7;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {variant === "bold" ? (
        <>
          <circle cx="60" cy="60" r="54" stroke={color} strokeWidth={sw} />
          <circle cx="60" cy="60" r="34" stroke={color} strokeWidth={sw} />
          <circle cx="60" cy="60" r="8.5" fill={color} />
        </>
      ) : (
        <>
          <circle cx="60" cy="60" r="54" stroke={color} strokeWidth={sw} />
          <circle cx="60" cy="60" r="38" stroke={color} strokeWidth={sw} />
          <circle cx="60" cy="60" r="22" stroke={color} strokeWidth={sw} />
          <circle cx="60" cy="60" r="7.5" fill={color} />
        </>
      )}
    </svg>
  );
}

export default Logo;
