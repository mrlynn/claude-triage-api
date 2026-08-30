import Content from "@theme-original/DocItem/Content";
import type ContentType from "@theme/DocItem/Content";
import type { WrapperProps } from "@docusaurus/types";
import type { ReactNode } from "react";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import AudioPlayer from "@site/src/components/AudioPlayer";

type Props = WrapperProps<typeof ContentType>;

/**
 * Renders the narration player above doc content on pages whose frontmatter
 * carries `audio_src` — emitted by sync-docs.mjs only when the generated MP3
 * actually exists, so a lab whose audio has not been generated yet simply has
 * no player rather than a broken one.
 */
export default function ContentWrapper(props: Props): ReactNode {
  const { frontMatter } = useDoc();
  const audioSrc = (frontMatter as { audio_src?: string }).audio_src;
  return (
    <>
      {typeof audioSrc === "string" && <AudioPlayer src={audioSrc} />}
      <Content {...props} />
    </>
  );
}
