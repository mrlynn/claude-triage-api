import { useState, type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
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
 * The poster is the video's own thumbnail, committed to static/img/video and
 * served locally — the artwork viewers see on YouTube, without the
 * i.ytimg.com request that fetching it from YouTube would put back on page
 * load. A lab without one falls back to the CSS-drawn cover, where the text
 * labels carry what the artwork otherwise would.
 */
export default function LabVideo({
  videoId,
  title,
  poster,
}: {
  videoId: string;
  title?: string;
  poster?: string;
}): ReactNode {
  const [playing, setPlaying] = useState(false);
  const posterUrl = useBaseUrl(poster ?? "");

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
        <button
          type="button"
          className={poster ? `${styles.poster} ${styles.withThumb}` : styles.poster}
          onClick={() => setPlaying(true)}
          aria-label={title ? `Play: ${title} — video` : "Play the lab video"}
        >
          {poster && (
            <img className={styles.thumb} src={posterUrl} alt="" loading="lazy" />
          )}
          <span className={styles.play} aria-hidden="true" />
          {!poster && (
            <>
              <span className={styles.label}>Watch this lab</span>
              <span className={styles.sub}>Narrated, with chapters and captions</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
