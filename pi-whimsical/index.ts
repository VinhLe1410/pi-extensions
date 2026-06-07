import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";

const shortMessages = [
  "Combobulating",
  "Concocting",
  "Spelunking",
  "Cogitating",
  "Ruminating",
  "Dithering",
  "Faffing",
  "Tinkering",
  "Futzing",
  "Kerfuffling",
  "Flummoxing",
  "Befuddling",
  "Tokenmaxxing",
  "Gaslighting",
  "Hallucinating",
];

const longMessages = [
  "Rewriting in Rust",
  "Skipping documents",
  "Wasting tokens",
  "Resetting git",
  "Making no mistake",
  "Providing false truths",
  "Complaining to the compiler",
  "Using cards everywhere",
  "Feeding the garbage collector",
  "Writing Python code to edit files",
  "Adding null pointers",
  "Editing node_modules",
  "Untangling spaghetti",
  "Adding useless comments",
  "Messing up YAML files",
  "Calibrating the flux capacitor",
  "Consulting the rubber duck",
  "Interrogating the stack trace",
  "Cross-examining the debugger",
  "Missing cache hits",
  "Giving the code a pep talk",
  "Of course, regex, everywhere",
  "Sending secrets to random websites",
  "Cursing the cache misses",
  "Blessing the build process",
  "Optimizing the build process",
  "Unraveling the regex",
  "Discovering hidden semicolons",
  "Unearthing buried bugs",
  "Smelling the code",
  "Cherry-picking the commits",
  "Slop forking open source",
  "Implementing useless helper functions",
  "Adding border to the buttons",
  "Hallucinating API endpoints",
  'Replacing types with "any"',
  "Installing random auth packages",
  "Overwriting the database",
  "Ignoring failing tests",
  "Disabling ESLint errors",
  "Reformatting files for the third time",
  "Writing scripts to edit code",
  "Refactoring unrelated code",
  "Undoing the changes with different code",
  "Getting the user banned by Anthropic",
  "Violating TOS",
  "Orchestrating cyber-attacks",
  "Subsidizing the subsidization",
  "Pwning environment variables",
  "Installing random scripts",
];

const messages = [...shortMessages, ...longMessages];
const WAVE_INTERVAL_MS = 50;
const WAVE_CYCLE_MS = 850;
const WAVE_FRAMES = Math.max(1, Math.round(WAVE_CYCLE_MS / WAVE_INTERVAL_MS));
const WAVE_TRAIL = 3;

function pickRandom(): string {
  return messages[Math.floor(Math.random() * messages.length)]!;
}

function renderWave(message: string, theme: Theme, frame: number): string {
  const chars = Array.from(message);
  if (chars.length === 0) return "";

  const progress = (frame % WAVE_FRAMES) / WAVE_FRAMES;
  const center = progress * (chars.length + WAVE_TRAIL * 2) - WAVE_TRAIL;
  return chars
    .map((char, index) => {
      const distance = Math.abs(index - center);
      if (distance <= 0.5) return theme.bold(theme.fg("accent", char));
      if (distance <= 1.5) return theme.fg("accent", char);
      if (distance <= WAVE_TRAIL) return theme.fg("muted", char);
      return theme.fg("dim", char);
    })
    .join("");
}

export default function (pi: ExtensionAPI) {
  let animationTimer: ReturnType<typeof setInterval> | undefined;

  function stopAnimation(): void {
    if (!animationTimer) return;
    clearInterval(animationTimer);
    animationTimer = undefined;
  }

  function startAnimation(ctx: ExtensionContext): void {
    stopAnimation();
    if (!ctx.hasUI) return;

    const message = pickRandom();
    let frame = 0;
    const render = () => ctx.ui.setWorkingMessage(renderWave(message, ctx.ui.theme, frame++));

    ctx.ui.setWorkingIndicator({ frames: [] });
    render();
    animationTimer = setInterval(render, WAVE_INTERVAL_MS);
    animationTimer.unref?.();
  }

  function resetWorkingRow(ctx: ExtensionContext): void {
    stopAnimation();
    if (!ctx.hasUI) return;
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingIndicator();
  }

  pi.on("turn_start", async (_event, ctx) => {
    startAnimation(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    resetWorkingRow(ctx);
  });

  pi.on("session_shutdown", () => {
    stopAnimation();
  });
}
