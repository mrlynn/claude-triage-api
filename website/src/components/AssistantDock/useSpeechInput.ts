import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input, using the browser's own speech recognition.
 *
 * HAND-MIRRORED from `storefront/components/AssistantChat/useSpeechInput.ts`,
 * which carries the full reasoning, for the same reason `untrusted.ts` is
 * mirrored: the two apps build from separate roots. The short version:
 *
 * The Messages API accepts text, images and documents — there is no audio
 * content block — so voice has to become text before it can be sent. Doing
 * that in the browser means no second vendor, no second key, no per-minute
 * bill, and no recording leaving the machine.
 *
 * Firefox ships no SpeechRecognition, so `supported` is false there and the
 * caller hides the button rather than offering one that does nothing.
 */

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionConstructor = new () => Recognition;

function constructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function useSpeechInput({
  onStart,
  onTranscript,
}: {
  onStart: () => void;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  // Detected in an effect: Docusaurus renders this on the server first, where
  // `window` does not exist.
  useEffect(() => setSupported(Boolean(constructor())), []);

  const toggle = useCallback(() => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = constructor();
    if (!Ctor) return;

    const instance = new Ctor();
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";

    let settled = "";
    instance.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTranscript(settled + interim);
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);

    recognition.current = instance;
    onStart();
    instance.start();
    setListening(true);
  }, [listening, onStart, onTranscript]);

  useEffect(() => () => recognition.current?.stop(), []);

  return { supported, listening, toggle };
}
