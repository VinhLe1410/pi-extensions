import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const shortMessages = [
  "Combobulating...",
  "Concocting...",
  "Spelunking...",
  "Cogitating...",
  "Ruminating...",
  "Dithering...",
  "Faffing...",
  "Tinkering...",
  "Futzing...",
  "Kerfuffling...",
  "Flummoxing...",
  "Befuddling...",
  "Tokenmaxxing...",
  "Gaslighting...",
  "Hallucinating...",
];

const longMessages = [
  "Rewriting in Rust...",
  "Skipping documents...",
  "Wasting tokens...",
  "Resetting git...",
  "Making no mistake...",
  "Providing false truths...",
  "Complaining to the compiler...",
  "Using cards everywhere...",
  "Feeding the garbage collector...",
  "Writing Python code to edit files...",
  "Adding null pointers...",
  "Editing node_modules...",
  "Untangling spaghetti...",
  "Adding useless comments...",
  "Messing up YAML files...",
  "Calibrating the flux capacitor...",
  "Consulting the rubber duck...",
  "Interrogating the stack trace...",
  "Cross-examining the debugger...",
  "Missing cache hits...",
  "Giving the code a pep talk...",
  "Of course, regex, everywhere...",
  "Sending secrets to random websites...",
  "Cursing the cache misses...",
  "Blessing the build process...",
  "Optimizing the build process...",
  "Unraveling the regex...",
  "Discovering hidden semicolons...",
  "Unearthing buried bugs...",
  "Smelling the code...",
  "Cherry-picking the commits...",
  "Slop forking open source...",
  "Implementing useless helper functions...",
  "Adding border to the buttons...",
  "Hallucinating API endpoints...",
  'Replacing types with "any"...',
  "Installing random auth packages...",
  "Overwriting the database...",
  "Ignoring failing tests...",
  "Disabling ESLint errors...",
  "Reformatting files for the third time...",
  "Writing scripts to edit code...",
  "Refactoring unrelated code...",
  "Undoing the changes with different code...",
  "Getting the user banned by Anthropic...",
  "Violating TOS...",
  "Orchestrating cyber-attacks...",
  "Subsidizing the subsidization...",
  "Pwning environment variables...",
  "Installing random scripts...",
];

const messages = [...shortMessages, ...longMessages];

function pickRandom(): string {
  return messages[Math.floor(Math.random() * messages.length)]!;
}

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom());
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(); // Reset for next time
  });
}
