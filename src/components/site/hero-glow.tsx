/**
 * A soft teal light over the lower half of the first screen, one colour throughout: it is
 * strongest at the bottom and fades upward. Its upper edge is a wide U — it rises at the left
 * and right (about mid-screen) and dips in the middle behind the scene.
 *
 * Light theme: light teal. Dark theme: a deep cyan-teal at low opacity over the near-black
 * page — Raycast's dark-hero hue, kept faint so it reads as haze, not a band.
 *
 * Shape: masked by the outside of a large ellipse centred at the top (the U), intersected with
 * a vertical fade so it dissolves before the end of the page. Static and purely decorative.
 */
export function HeroGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[max(860px,130svh)] bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--glow)_45%,transparent)_40%,var(--glow)_75%)] select-none [mask-composite:intersect] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,transparent_84%,rgb(0_0_0/0.55)_92%,black_100%),linear-gradient(to_bottom,black_70%,transparent)]"
    />
  );
}
