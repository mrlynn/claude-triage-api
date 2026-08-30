import Content from "@theme-original/DocItem/Content";
import type ContentType from "@theme/DocItem/Content";
import type { WrapperProps } from "@docusaurus/types";
import type { ReactNode } from "react";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import AudioPlayer from "@site/src/components/AudioPlayer";
import LabVideo from "@site/src/components/LabVideo";

type Props = WrapperProps<typeof ContentType>;

/**
 * Renders the narration player above doc content on pages whose frontmatter
 * carries `audio_src` — emitted by sync-docs.mjs only when the generated MP3
 * actually exists, so a lab whose audio has not been generated yet simply has
 * no player rather than a broken one.
 *
 * `video_id` works the same way, from src/data/lab-videos.json. The video
 * comes first: it is the same narration the player holds, plus the picture, so
 * a reader who wants to listen rather than read is better served by it. The
 * audio player stays for anyone who would rather not watch anything.
 */
export default function ContentWrapper(props: Props): ReactNode {
  const { frontMatter } = useDoc();
  const { audio_src: audioSrc, video_id: videoId, title } = frontMatter as {
    audio_src?: string;
    video_id?: string;
    title?: string;
  };
  return (
    <>
      {typeof videoId === "string" && <LabVideo videoId={videoId} title={title} />}
      {typeof audioSrc === "string" && <AudioPlayer src={audioSrc} />}
      <Content {...props} />
    </>
  );
}
