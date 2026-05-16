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
  "Adding comments...",
  "Skipping documents...",
  "Wasting tokens...",
  "Resetting git...",
  "Making no mistake...",
  "Providing false truths...",
  "Bribing the compiler...",
  "Using cards everywhere...",
  "Appeasing the garbage collector...",
  "Summoning semicolons...",
  "Herding pointers...",
  "Editing node_modules...",
  "Untangling spaghetti...",
  "Reticulating splines...",
  "Reversing the polarity...",
  "Calibrating the flux capacitor...",
  "Consulting the rubber duck...",
  "Interrogating the stack trace...",
  "Cross-examining the debugger...",
  "Having words with the cache...",
  "Giving the code a pep talk...",
  "Whispering passwords to the void...",
  "Cursing the cache misses...",
  "Blessing the build process...",
  "Untying the type knots...",
  "Unraveling the regex...",
  "Discovering hidden semicolons...",
  "Unearthing buried bugs...",
  "Excavating ancient APIs...",
  "Spelunking through the stack...",
  "Smelling the code...",
  "Cherry-picking the commits...",
  "Slop forking open source...",
  "Implementing redundant helper functions...",
  "Adding border to the buttons...",
  "Listing fake API endpoints...",
  'Replacing types with "any"...',
  "Installing random auth packages...",
  "Overwriting the database...",
  "Ignoring failing tests...",
  "Disabling ESLint errors...",
  "Reformatting Prettier-formatted files...",
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
