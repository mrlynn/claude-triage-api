import { useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * The lab's video, above the lab.
 *
 * A click-to-play facade rather than an iframe, for the same reasons as the
 * one on the landing page: an embedded player costs about half a megabyte
 * before anyone has asked for it, drags the largest-contentful-paint of every
 * lab page behind it, and sets Google cookies on a course that otherwise needs
 * no account and no key. Nothing reaches YouTube until the button is pressed,
 * and then it is the nocookie host.
 *
 * The poster is drawn in CSS rather than fetched from i.ytimg.com, which would
 * put a third-party request back on load and undo the point.
 */
export default function LabVideo({ videoId, title }: { videoId: string; title?: string }): ReactNode {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={styles.frame}>
      {playing ? (
        <iframe
          className={styles.player}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title ? `${title} — video` : "Lab video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className={styles.poster} onClick={() => setPlaying(true)}>
          <span className={styles.play} aria-hidden="true" />
          <span className={styles.label}>Watch this lab</span>
          <span className={styles.sub}>Narrated, with chapters and captions</span>
        </button>
      )}
    </div>
  );
}
