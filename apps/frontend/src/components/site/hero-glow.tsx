import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';

/**
 * The backdrop behind the hero.
 *
 * Light mode is ui-layouts' Financial hero background, reproduced exactly (hero-financial.tsx):
 * the page field is #f7f9fc (--bg), then, bottom to top,
 *   1. a wash, blue-50 → blue-100 → transparent, entering like their TimelineAnimation step 5:
 *      from blur(20px) and opacity 0, over 0.5s after a 2.5s delay. Theirs is 600px tall; here
 *      blue-100 lands at 600px (the hero's foot) and the fade then runs on to the page's bottom,
 *   2. their two blurred beams in the top-left corner (z-1, so they sit over the wash).
 * Their cloud photo (50%, cover) lives in HeroClouds: it fills the hero and ends at the scene's
 * top dotted rule, so the clouds sit above that line and only the gradient continues below.
 *
 * Dark mode shows none of it: just a little extra grain over the hero (see .dark .hero-glow).
 */
export function HeroGlow() {
  const reduce = useReducedMotion();
  return (
    <>
      <div aria-hidden className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[max(860px,130svh)] select-none" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 isolate overflow-hidden select-none dark:hidden">
        <motion.div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,#eff6ff,#dbeafe_600px,transparent)]"
          initial={reduce ? false : { filter: 'blur(20px)', opacity: 0 }}
          animate={{ filter: 'blur(0px)', opacity: 1 }}
          transition={{ delay: 2.5, duration: 0.5 }}
        />
        <LightBeams />
      </div>
    </>
  );
}

/**
 * The Financial hero's cloud photo (50%, cover, centred), filling the top of the page down to
 * the scene's top dotted rule and fading out exactly there, so every cloud sits above that line
 * and the wash carries on alone below it. Sideways it stays full inside the dotted rails and all
 * but vanishes in the margins beyond them (see .hero-clouds). It sits over the wash and
 * under the dotted rails (one layer up). Place it inside a `relative` wrapper around the hero
 * section; it reaches up behind the header too. Light mode only.
 */
export function HeroClouds() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-28 bottom-0 left-1/2 -z-10 w-screen -translate-x-1/2 hero-clouds bg-[url('/backgrounds/clouds.webp')] bg-cover bg-center opacity-50 select-none dark:hidden"
    />
  );
}

/** The Financial hero's two beams, exactly: geometry, 32px blur, and their own blue stops. */
function LightBeams() {
  const id = useId().replace(/:/g, '');
  return (
    <svg width="358" height="483" viewBox="0 0 358 483" fill="none" className="absolute top-0 left-0 z-1">
      <g filter={`url(#${id}-f0)`}>
        <rect x="-86.9961" y="-33.114" width="72" height="541" rx="36" transform="rotate(-30.8182 -86.9961 -33.114)" fill={`url(#${id}-p0)`} />
      </g>
      <g filter={`url(#${id}-f1)`}>
        <rect x="-17" y="-135.113" width="50.0937" height="541" rx="25.0469" transform="rotate(-30.8182 -17 -135.113)" fill={`url(#${id}-p1)`} />
      </g>
      <defs>
        <filter id={`${id}-f0`} x="-137.641" y="-120.646" width="440.285" height="602.787" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="32" result="effect1_foregroundBlur_0_1" />
        </filter>
        <filter id={`${id}-f1`} x="-71.707" y="-215.486" width="429.598" height="599.69" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="32" result="effect1_foregroundBlur_0_1" />
        </filter>
        <linearGradient id={`${id}-p0`} x1="-50.9961" y1="-33.114" x2="-50.9961" y2="507.886" gradientUnits="userSpaceOnUse">
          <stop stopColor="#91bbfb" />
          <stop offset="1" stopColor="#E6F1FF" />
        </linearGradient>
        <linearGradient id={`${id}-p1`} x1="8.04686" y1="-135.113" x2="8.04686" y2="405.887" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8dbafd" />
          <stop offset="1" stopColor="#c1d9f8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
