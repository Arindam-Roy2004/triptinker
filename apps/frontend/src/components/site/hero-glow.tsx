/**
 * Pattern Craft's Pastel Wave, adapted to pale blue, soft teal and silver:
 * https://github.com/megh-bari/pattern-craft/blob/main/src/data/patterns.ts
 *
 * Keep the existing U-shaped edge and vertical fade. The third mask preserves the original
 * 45%-to-full colour strength while allowing the palette to blend across the backdrop.
 * Dark mode uses the existing near-black page with no additional glow. Static decoration.
 */
export function HeroGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[max(860px,130svh)] bg-[image:var(--glow)] select-none [mask-composite:intersect] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,transparent_84%,rgb(0_0_0/0.55)_92%,black_100%),linear-gradient(to_bottom,black_70%,transparent),linear-gradient(to_bottom,rgb(0_0_0/0.45)_40%,black_75%)]"
    />
  );
}
