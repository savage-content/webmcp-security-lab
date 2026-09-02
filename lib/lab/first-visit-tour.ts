export type FirstVisitTourStep = {
  stage: 'Welcome' | 'Choose' | 'Observe' | 'Inspect' | 'Run' | 'Verify';
  anchor: '#top' | '#setup' | '#observe' | '#lesson' | '#ledger';
  title: string;
  description: string;
  action: string;
};

export const firstVisitTourSteps = [
  {
    stage: 'Welcome',
    anchor: '#top',
    title: 'A website can offer actions to your AI.',
    description:
      'ChatGPT calls them Site Tools; WebMCP is the proposed web standard behind them. Opening this page only exposes a synthetic practice action. It does not approve or run anything.',
    action: 'First, learn to separate “offered” from “approved” and “ran.”',
  },
  {
    stage: 'Choose',
    anchor: '#setup',
    title: 'Choose the path that matches your browser.',
    description:
      'Use native Site Tools in the ChatGPT or Codex built-in browser, try the advanced LeftOut Local Guard, or learn without invoking anything. These are separate paths.',
    action: 'Most people should keep the recommended built-in browser path selected.',
  },
  {
    stage: 'Observe',
    anchor: '#observe',
    title: 'The status panel reports only what the page can prove.',
    description:
      'Registration means the page offered an action. It does not prove that your AI discovered it, that a safety review appeared, or that the action ran.',
    action: 'Check the four status facts before approving any action.',
  },
  {
    stage: 'Inspect',
    anchor: '#lesson',
    title: 'Inspect the real authority, then narrow it.',
    description:
      'Each lesson shows the visible promise, the declared inputs, and the possible effect. The Membrane practice reduces that broad offer to one exact task, one target, and one use.',
    action: 'Prepare the approval only after the allowed and forbidden effects are clear.',
  },
  {
    stage: 'Run',
    anchor: '#lesson',
    title: 'Approval prepares one action—it still does not run it.',
    description:
      'The lesson gives you one plain-language request for your agent. Run it once, without retries or follow-on actions. The read-only path can finish without invoking anything.',
    action: 'Stop if the client shows a different action, target, or effect than you approved.',
  },
  {
    stage: 'Verify',
    anchor: '#ledger',
    title: 'Verify the effect, close authority, and keep the receipt.',
    description:
      'The result compares before and after state, checks side effects, and records what this page or Local Guard actually observed. A suspicious result can become a privacy-safe issue draft; nothing is published automatically.',
    action: 'Read PASS or FAIL, then continue to the next lesson or review the evidence.',
  },
] as const satisfies ReadonlyArray<FirstVisitTourStep>;

