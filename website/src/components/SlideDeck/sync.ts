/**
 * The link between the deck window and the presenter window.
 *
 * WHAT THIS IS FOR: notes rendered under the slide are fine until the laptop
 * is mirroring to a projector, at which point the room reads your notes with
 * you. The fix is a second window on the laptop screen while the deck goes
 * full screen on the projector — which means two documents that have to agree
 * on which slide is up.
 *
 * WHY BroadcastChannel: both windows are same-origin documents in the same
 * browser, so this needs no server, no polling and no network. A postMessage
 * to the opener would also work, but it dies the moment either window is
 * reloaded — and reloading the deck mid-talk is exactly the panic move
 * somebody makes when a projector misbehaves. A channel is addressed by name,
 * so a reloaded window rejoins by opening it again.
 *
 * WHY localStorage AS WELL, for the same state:
 *
 *   1. It paints the presenter window before any handshake completes. Opening
 *      a window and seeing an empty pane for 200ms reads as broken.
 *   2. It survives a reload of either side.
 *   3. `storage` events are a second delivery path if BroadcastChannel is
 *      missing or has been disabled — the deck degrades to working rather
 *      than to silent.
 *
 * WHO OWNS WHAT: the deck owns the slide index; it is the only writer. The
 * presenter window owns its own timer, which is why the timer is not in this
 * state at all — a clock that lived in the deck would be a second source of
 * truth to keep in sync for no benefit, and the presenter can be closed and
 * reopened without the deck caring.
 */

export const CHANNEL = "nw-talk-deck";
export const STATE_KEY = "nw-talk-deck-state";

/** Everything the presenter window needs in order to draw itself. */
export type DeckState = {
  index: number;
  total: number;
  /** Bumped by the deck on every publish, so a stale snapshot is detectable. */
  at: number;
};

export type Message =
  /** Deck → presenter. The whole state, every time; it is four numbers. */
  | { type: "state"; state: DeckState }
  /** Presenter → deck. "Are you there, and where are you?" */
  | { type: "hello" }
  /** Presenter → deck. Drive the slide from the notes window. */
  | { type: "goto"; index: number }
  | { type: "step"; delta: number };

/**
 * BroadcastChannel exists everywhere this site is used, but a page can be
 * loaded with it disabled, and it does not exist during SSR. Everything below
 * treats its absence as "fall back to storage events", never as an error.
 */
function channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function readSnapshot(): DeckState | null {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeckState;
    return typeof parsed?.index === "number" ? parsed : null;
  } catch {
    // Private mode, blocked storage, or somebody else's key in our slot.
    return null;
  }
}

function writeSnapshot(state: DeckState): void {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage is a convenience here, never the mechanism. Losing it costs
    // the presenter window its instant first paint and nothing else.
  }
}

/**
 * Opens the link. Returns a `post` for sending and a `close` for teardown;
 * `onMessage` receives everything from the OTHER window.
 *
 * A BroadcastChannel does not deliver to the sender, which is what makes this
 * safe to use on both ends without echo suppression.
 */
export function connect(onMessage: (msg: Message) => void): {
  post: (msg: Message) => void;
  publish: (state: DeckState) => void;
  close: () => void;
} {
  const bc = channel();
  if (bc) bc.onmessage = (event) => onMessage(event.data as Message);

  // The storage fallback carries state only — commands from the presenter
  // would need a second key and an ack, and a browser without
  // BroadcastChannel is not one this deck needs to be driveable from.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STATE_KEY || !event.newValue) return;
    try {
      onMessage({ type: "state", state: JSON.parse(event.newValue) });
    } catch {
      /* ignore a malformed write */
    }
  };
  if (!bc) window.addEventListener("storage", onStorage);

  return {
    post: (msg) => bc?.postMessage(msg),
    publish: (state) => {
      writeSnapshot(state);
      bc?.postMessage({ type: "state", state });
    },
    close: () => {
      bc?.close();
      if (!bc) window.removeEventListener("storage", onStorage);
    },
  };
}
